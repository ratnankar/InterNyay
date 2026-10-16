import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { isSupportRequest, SUPPORT_REPLY } from '../constants/contact'
import { getErrorMessage } from '../utils/errorMessages'

// Running counter used to give every chat message a unique id
let nextId = 1

// Hook that powers the chat assistant: keeps the message list, talks to the backend and handles loading state
export default function useChat() {
  // Chat messages shown in the widget
  const [messages, setMessages] = useState([])
  // True while we are waiting for the assistant's reply
  const [loading, setLoading] = useState(false)
  // null = not checked yet, true/false = whether the backend has the chat assistant configured
  const [enabled, setEnabled] = useState(null)
  // Ref copy of messages so send() can read the latest history without re-creating itself on every message
  const messagesRef = useRef([])
  // Tracks whether the component is still on screen so we don't update state after unmount
  const mounted = useRef(true)

  // Flip the mounted flag on mount and off on unmount
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Keep the ref in sync with the latest messages
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Ask the backend if the chat assistant is available; on any error treat it as disabled
  const loadStatus = useCallback(async () => {
    try {
      const status = await api.chat.status()
      if (mounted.current) setEnabled(!!status?.enabled)
    } catch {
      if (mounted.current) setEnabled(false)
    }
  }, [])

  // Send a question: adds it to the chat, calls the backend with the earlier history and appends the reply (or an error message)
  const send = useCallback(async (text) => {
    // Ignore empty input and double submits while a reply is still loading
    const question = String(text || '').trim()
    if (!question || loading) return

    // Previous messages in the format the API expects, leaving out failed (error) bubbles
    const history = messagesRef.current
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content }))

    // The user's own message, shown immediately
    const asked = { id: nextId++, role: 'user', content: question }

    // Support-type questions get a canned reply with a contact action instead of calling the AI
    if (isSupportRequest(question)) {
      setMessages(prev => [...prev, asked,
        { id: nextId++, role: 'assistant', content: SUPPORT_REPLY, action: 'contact' }])
      return
    }

    // Show the question right away, then wait for the reply
    setMessages(prev => [...prev, asked])
    setLoading(true)

    try {
      const res = await api.chat.send([...history, { role: 'user', content: question }])
      if (!mounted.current) return
      setMessages(prev => [...prev, { id: nextId++, role: 'assistant', content: res.reply }])
    } catch (err) {
      if (!mounted.current) return
      setMessages(prev => [...prev, {
        id: nextId++,
        role: 'assistant',
        error: true,
        content: getErrorMessage(err, 'Something went wrong. Please try again.'),
      }])
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [loading])

  // Reset the conversation
  const clear = useCallback(() => setMessages([]), [])

  return { messages, loading, enabled, loadStatus, send, clear }
}
