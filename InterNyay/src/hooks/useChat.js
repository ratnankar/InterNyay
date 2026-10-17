import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useApp } from '../context/AppContext'
import { isSupportRequest, SUPPORT_REPLY } from '../constants/contact'
import { getErrorMessage } from '../utils/errorMessages'

// How many of the latest messages are sent to the assistant as context with each question
const HISTORY_SENT = 20

// Running counter used to give every chat message a unique id
let nextId = 1

// Turns saved messages from the server into chat bubbles
const toBubbles = saved => (Array.isArray(saved) ? saved : []).map(m => ({
  id: nextId++, role: m.role, content: m.content, ...(m.action ? { action: m.action } : {}),
}))

// Hook that powers the chat assistant: the open chat, the list of saved chats, and talking to the backend.
// Every chat is saved on the server. The open chat is also remembered in this browser tab, so a reload brings
// the same chat back (and a new, still empty chat stays empty).
export default function useChat() {
  const { currentUser } = useApp()
  // Messages of the open chat
  const [messages, setMessages] = useState([])
  // True while we are waiting for the assistant's reply
  const [loading, setLoading] = useState(false)
  // null = not checked yet, true/false = whether the backend has the chat assistant configured
  const [enabled, setEnabled] = useState(null)
  // True while a saved chat is being loaded from the server (so the welcome text does not flash first)
  const [historyLoading, setHistoryLoading] = useState(false)
  // Message shown when the chat list or a saved chat could not be loaded
  const [historyError, setHistoryError] = useState('')
  // Saved chats, latest first, and the id of the open one (null = a new chat that is not saved yet)
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveIdState] = useState(null)
  // Ref copies so send() can read the latest values without re-creating itself on every message
  const messagesRef = useRef([])
  const activeIdRef = useRef(null)
  // Tracks whether the component is still on screen so we don't update state after unmount
  const mounted = useRef(true)
  // Bumped whenever another chat is opened or a new one is started; a reply that arrives for an older number is thrown away
  const generation = useRef(0)

  // Where the open chat is remembered for this browser tab: a chat id, or "new" for an empty new chat
  const storageKey = `internyay_chat_active_${currentUser?.id ?? 'guest'}`
  const remember = value => { try { sessionStorage.setItem(storageKey, value == null ? 'new' : String(value)) } catch { /* storage unavailable */ } }
  const recall = () => { try { return sessionStorage.getItem(storageKey) } catch { return null } }

  // Flip the mounted flag on mount and off on unmount
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Keep the refs in sync with the latest state
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Marks a chat (or none) as the open one
  const setActive = useCallback(id => {
    activeIdRef.current = id
    setActiveIdState(id)
    remember(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // Ask the backend if the chat assistant is available; on any error treat it as disabled
  const loadStatus = useCallback(async () => {
    try {
      const status = await api.chat.status()
      if (mounted.current) setEnabled(!!status?.enabled)
    } catch {
      if (mounted.current) setEnabled(false)
    }
  }, [])

  // Reloads the chat list quietly (after a message was saved)
  const refreshList = useCallback(async () => {
    try {
      const list = await api.chat.conversations()
      if (mounted.current) setConversations(Array.isArray(list) ? list : [])
    } catch { /* the list stays as it was */ }
  }, [])

  // Once per page load: loads the chat list and brings back the chat that was open (the latest one on a fresh start)
  const historyLoaded = useRef(false)
  const loadHistory = useCallback(async () => {
    if (historyLoaded.current) return
    historyLoaded.current = true
    setHistoryLoading(true)
    setHistoryError('')
    const myGeneration = generation.current
    try {
      const list = await api.chat.conversations()
      if (!mounted.current) return
      const chats = Array.isArray(list) ? list : []
      setConversations(chats)
      // Something was already typed while the list loaded: leave that chat as it is
      if (generation.current !== myGeneration || messagesRef.current.length > 0) return

      const saved = recall()
      if (saved === 'new') return
      const target = chats.find(c => String(c.id) === saved) || chats[0]
      if (!target) return
      const detail = await api.chat.conversation(target.id)
      if (!mounted.current || generation.current !== myGeneration || messagesRef.current.length > 0) return
      setMessages(toBubbles(detail?.messages))
      setActive(target.id)
    } catch {
      // Could not load it: start with an empty chat and try again the next time the panel opens
      historyLoaded.current = false
    } finally {
      if (mounted.current) setHistoryLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setActive, storageKey])

  // Send a question: adds it to the chat, calls the backend with the earlier messages and appends the reply (or an error message)
  const send = useCallback(async (text) => {
    // Ignore empty input and double submits while a reply is still loading
    const question = String(text || '').trim()
    if (!question || loading) return

    // Previous messages in the format the API expects, leaving out failed (error) bubbles
    // (only the latest ones: a saved chat can be much longer than the assistant needs)
    const history = messagesRef.current
      .filter(m => !m.error)
      .slice(-HISTORY_SENT)
      .map(m => ({ role: m.role, content: m.content }))

    // The user's own message, shown immediately
    const asked = { id: nextId++, role: 'user', content: question }
    const myGeneration = generation.current

    // Support-type questions get a canned reply with a contact action instead of calling the AI
    if (isSupportRequest(question)) {
      setMessages(prev => [...prev, asked,
        { id: nextId++, role: 'assistant', content: SUPPORT_REPLY, action: 'contact' }])
      api.chat.addToHistory([
        { role: 'user', content: question },
        { role: 'assistant', content: SUPPORT_REPLY, action: 'contact' },
      ], activeIdRef.current).then(res => {
        if (!mounted.current) return
        if (generation.current === myGeneration && res?.conversationId) setActive(res.conversationId)
        refreshList()
      }).catch(() => { /* the answer is already on screen; only the saved copy is missing */ })
      return
    }

    // Show the question right away, then wait for the reply
    setMessages(prev => [...prev, asked])
    setLoading(true)

    try {
      const res = await api.chat.send([...history, { role: 'user', content: question }], activeIdRef.current)
      if (!mounted.current) return
      // The reply was saved in a chat of its own even if another chat was opened meanwhile, so the list is refreshed either way
      refreshList()
      if (generation.current !== myGeneration) return
      if (res.conversationId && res.conversationId !== activeIdRef.current) setActive(res.conversationId)
      setMessages(prev => [...prev, { id: nextId++, role: 'assistant', content: res.reply }])
    } catch (err) {
      if (!mounted.current || generation.current !== myGeneration) return
      setMessages(prev => [...prev, {
        id: nextId++,
        role: 'assistant',
        error: true,
        content: getErrorMessage(err, 'Something went wrong. Please try again.'),
      }])
    } finally {
      if (mounted.current && generation.current === myGeneration) setLoading(false)
    }
  }, [loading, refreshList, setActive])

  // Closes the open chat (it stays saved in the list) and starts a new, empty one.
  // A question still waiting for its reply keeps going and is saved in the chat it was asked in
  const newChat = useCallback(() => {
    generation.current += 1
    setMessages([])
    setLoading(false)
    setHistoryError('')
    setActive(null)
  }, [setActive])

  // Opens a saved chat from the list. Returns true when it opened
  const openConversation = useCallback(async id => {
    if (id === activeIdRef.current && messagesRef.current.length > 0) return true
    generation.current += 1
    const myGeneration = generation.current
    setLoading(false)
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const detail = await api.chat.conversation(id)
      if (!mounted.current || generation.current !== myGeneration) return false
      setMessages(toBubbles(detail?.messages))
      setActive(id)
      return true
    } catch (err) {
      if (mounted.current && generation.current === myGeneration) {
        setHistoryError(getErrorMessage(err, 'Could not open that chat. Please try again.'))
        // The chat may have been deleted on another device
        refreshList()
      }
      return false
    } finally {
      if (mounted.current && generation.current === myGeneration) setHistoryLoading(false)
    }
  }, [refreshList, setActive])

  // Deletes one saved chat; if it is the open one, a new empty chat is shown. Returns true when deleted
  const removeConversation = useCallback(async id => {
    try {
      await api.chat.deleteConversation(id)
    } catch (err) {
      setHistoryError(getErrorMessage(err, 'Could not delete the chat. Please try again.'))
      return false
    }
    if (!mounted.current) return true
    setConversations(list => list.filter(c => c.id !== id))
    if (id === activeIdRef.current) newChat()
    return true
  }, [newChat])

  // Deletes every saved chat and shows a new empty one
  const removeAllConversations = useCallback(async () => {
    try {
      await api.chat.clearAll()
    } catch (err) {
      setHistoryError(getErrorMessage(err, 'Could not delete the chats. Please try again.'))
      return false
    }
    if (!mounted.current) return true
    setConversations([])
    newChat()
    return true
  }, [newChat])

  return {
    messages, loading, historyLoading, historyError, enabled, conversations, activeId,
    loadStatus, loadHistory, send, newChat, openConversation, removeConversation, removeAllConversations,
  }
}
