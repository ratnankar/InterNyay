import { useState, useMemo, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import Dropdown from '../components/common/Dropdown'
import useSeeMore from '../hooks/useSeeMore'
import usePersistedState from '../hooks/usePersistedState'
import SeeMore from '../components/common/SeeMore'

import Icon from '../components/common/Icon'
import { confirmDialog } from '../utils/confirmDialog'
import useSessionState from '../hooks/useSessionState'
import ClearableDateInput from '../components/common/ClearableDateInput'
import SearchInput from '../components/common/SearchInput'
import Linkify from '../components/common/Linkify'
// Task statuses available in the status filter
const STATUSES = ['Pending', 'Completed']

// Category name used for tasks that have no category
const UNCATEGORIZED = 'General'

const createdTime = t => new Date(t.createdAt).getTime() || 0

// To-Do List page: add tasks, filter by status, search and category, sort, and tick tasks off
export default function TodoList() {
  // Task data and actions from the app context
  const {
    todos, addTodo, updateTodo, deleteTodo,
    taskCategories, addTaskCategory, deleteTaskCategory,
    cases, openCaseWindow,
  } = useApp()
  // Add-task form visibility, status and category filters, search text and sort order
  const [showAdd, setShowAdd] = useState(false)
  const [filterStatus, setFilterStatus] = usePersistedState('todos_status', 'All')
  const [selectedCategory, setSelectedCategory] = usePersistedState('todos_category', 'All')
  const [searchQuery, setSearchQuery] = useSessionState('todos_search', '')
  const [sortBy, setSortBy] = usePersistedState('todos_sort', 'date', ['date', 'oldest', 'dueDate'])

  // Custom category typing mode in the add form and the typed name
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [sidebarAdding, setSidebarAdding] = useState(false)
  const [sidebarCategoryName, setSidebarCategoryName] = useState('')
  const [linkingId, setLinkingId] = useState(null)

  const allCategories = useMemo(() => {
    const byKey = new Map()
    for (const name of [...taskCategories.map(c => c.name), ...todos.map(t => t.category)]) {
      const clean = (name || '').trim()
      if (clean && clean.toLowerCase() !== UNCATEGORIZED.toLowerCase() && !byKey.has(clean.toLowerCase())) byKey.set(clean.toLowerCase(), clean)
    }
    return [...byKey.values()]
  }, [taskCategories, todos])

  const caseById = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases])

  const categoryOf = useMemo(() => {
    const canon = new Map(allCategories.map(c => [c.toLowerCase(), c]))
    return todo => canon.get((todo.category || '').trim().toLowerCase()) || UNCATEGORIZED
  }, [allCategories])

  const caseOptionLabel = c => `${c.title}${c.caseNo ? ` — ${c.caseNo}` : ''}`

  // Values of the add-task form
  const [newTodo, setNewTodo] = useState({
    title: '',
    description: '',
    dueDate: '',
    status: 'Pending',
    category: '',
    caseId: '',
  })

  // Typed category name with extra spaces removed
  function commitTypedCategory() {
    return newCategoryName.trim()
  }

  // Go back to 'All' if the selected category no longer exists
  useEffect(() => {
    if (selectedCategory === 'All' || selectedCategory === UNCATEGORIZED) return
    // Tasks still loading: do not mistake an empty list for a removed category and forget the remembered chip
    if (!todos.length && !taskCategories.length) return
    if (!allCategories.includes(selectedCategory)) setSelectedCategory('All')
  }, [selectedCategory, allCategories, todos.length, taskCategories.length, setSelectedCategory])

  // Tasks after the status filter and search text (before the category filter)
  const statusAndSearchFiltered = useMemo(() => {
    let items = todos
    if (filterStatus !== 'All') items = items.filter(t => t.status === filterStatus)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
    }
    return items
  }, [todos, filterStatus, searchQuery])

  // Sidebar categories with their task counts; General is always listed first
  const categoryList = useMemo(() => {
    const counts = new Map()
    for (const todo of statusAndSearchFiltered) {
      const cat = categoryOf(todo)
      counts.set(cat, (counts.get(cat) || 0) + 1)
    }
    const names = [...new Set([...allCategories, ...counts.keys()])].filter(c => c !== UNCATEGORIZED)
    names.sort((a, b) => a.localeCompare(b))
    return [
      { name: UNCATEGORIZED, count: counts.get(UNCATEGORIZED) || 0 },
      ...names.map(name => ({ name, count: counts.get(name) || 0 })),
    ]
  }, [statusAndSearchFiltered, allCategories, categoryOf])

  // Tasks in the selected category, sorted by due date or newest first
  const filtered = useMemo(() => {
    let items = statusAndSearchFiltered
    if (selectedCategory !== 'All') items = items.filter(t => categoryOf(t) === selectedCategory)

    return [...items].sort((a, b) => {
      if (sortBy === 'dueDate') return (a.dueDate || '').localeCompare(b.dueDate || '')
      if (sortBy === 'oldest') return createdTime(a) - createdTime(b)
      return createdTime(b) - createdTime(a)
    })
  }, [statusAndSearchFiltered, selectedCategory, sortBy, categoryOf])

  // Show the tasks a page at a time; starts again when the filters, category or sort change
  const tasksStep = 20
  const {
    visible: visibleTodos,
    remaining: tasksRemaining,
    showMore: showMoreTasks,
  } = useSeeMore(filtered, [filterStatus, selectedCategory, searchQuery, sortBy].join('|'), tasksStep)

  // Add the task from the form, using the typed custom category if one is being entered, then reset the form
  async function handleAddTodo() {
    if (!newTodo.title.trim()) return

    let category = newTodo.category
    if (addingCategory) {
      const typed = commitTypedCategory()
      category = typed ? await addTaskCategory(typed) : ''
      if (category === null) return
    }

    addTodo({
      ...newTodo,
      category,
      caseId: newTodo.caseId ? Number(newTodo.caseId) : null,
      id: Date.now(),
      createdAt: Date.now(),
    })
    closeAdd()
  }

  async function commitCategoryFromForm() {
    const typed = commitTypedCategory()
    if (!typed) return
    const saved = await addTaskCategory(typed)
    if (saved === null) return
    setNewTodo(t => ({ ...t, category: saved }))
    setNewCategoryName('')
    setAddingCategory(false)
  }

  async function commitSidebarCategory() {
    const typed = sidebarCategoryName.trim().replace(/\s+/g, ' ')
    if (!typed) return
    const existing = typed.toLowerCase() === UNCATEGORIZED.toLowerCase()
      ? UNCATEGORIZED
      : allCategories.find(c => c.toLowerCase() === typed.toLowerCase())
    const name = existing || await addTaskCategory(typed)
    if (name === null) return
    setSelectedCategory(name)
    setSidebarCategoryName('')
    setSidebarAdding(false)
  }

  function closeSidebarAdd() {
    setSidebarCategoryName('')
    setSidebarAdding(false)
  }

  function changeLink(todo, value) {
    updateTodo(todo.id, value ? { caseId: Number(value) } : { clearCase: true, caseId: null })
    setLinkingId(null)
  }

  function closeAdd() {
    setNewTodo({ title: '', description: '', dueDate: '', status: 'Pending', category: '', caseId: '' })
    setAddingCategory(false)
    setNewCategoryName('')
    setShowAdd(false)
  }

  // Remove a category after confirming; its tasks move to General instead of being deleted
  async function removeCategory(name) {
    if (!await confirmDialog(`Remove the "${name}" category? Its tasks will move to General — they won't be deleted.`)) return
    const saved = taskCategories.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (await deleteTaskCategory(name, saved ? saved.id : null)) setSelectedCategory('All')
  }

  // Switch a task between Pending and Completed
  function toggleStatus(id) {
    const todo = todos.find(t => t.id === id)
    const nextStatus = todo.status === 'Completed' ? 'Pending' : 'Completed'
    updateTodo(id, { status: nextStatus })
  }

  // Counts shown in the stat cards
  const stats = {
    total: todos.length,
    pending: todos.filter(t => t.status === 'Pending').length,
    completed: todos.filter(t => t.status === 'Completed').length,
  }

  return (
    <div>
      {/* Page title and the Add Task / Cancel button */}
      <div className="page-header">
        <div>
          <h1 className="page-title">To-Do List</h1>
          <p className="page-subtitle">Manage tasks and action items</p>
        </div>
        <button type="button" className="btn-gold" onClick={() => (showAdd ? closeAdd() : setShowAdd(true))}>
          {showAdd ? <><Icon name="close" /> Cancel</> : '+ Add Task'}
        </button>
      </div>

      {/* Stat cards: total, pending and completed tasks */}
      <div className="todo-stats-grid">
        {[
          { label: 'Total', value: stats.total, color: 'var(--color-navy)' },
          { label: 'Pending', value: stats.pending, color: 'var(--color-pending)' },
          { label: 'Completed', value: stats.completed, color: 'var(--color-active)' },
        ].map(stat => (
          <div className="stat-card" key={stat.label}>
            <p className="stat-card__label">{stat.label}</p>
            <p className="stat-card__value" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Add-task form */}
      {showAdd && (
        <div className="card todo-add-form">
          <h3 className="todo-form-title">New Task</h3>
          <div className="todo-form-grid">
            <div className="form-field-group form-field-group--full">
              <label className="form-label">Title</label>
              <input className="form-input" placeholder="What needs to be done?"
                value={newTodo.title}
                onChange={e => setNewTodo({ ...newTodo, title: e.target.value })} />
            </div>

            <div className="form-field-group form-field-group--full">
              <label className="form-label">Description</label>
              <textarea className="form-input" placeholder="Add details..."
                value={newTodo.description}
                onChange={e => setNewTodo({ ...newTodo, description: e.target.value })}
                rows={3} />
            </div>

            <div className="form-field-group">
              {/* Category dropdown, or a text box when adding a custom category */}
              <label className="form-label">Category</label>
              {!addingCategory ? (
                <Dropdown
                  className="form-input"
                  value={newTodo.category}
                  onChange={e => {
                    if (e.target.value === '__add_new__') {
                      setAddingCategory(true)
                      return
                    }
                    setNewTodo({ ...newTodo, category: e.target.value })
                  }}
                >
                  <option value="">General</option>
                  {allCategories.map(c => <option key={c}>{c}</option>)}
                  <option value="__add_new__">+ Add Custom Category…</option>
                </Dropdown>
              ) : (
                <div className="todo-new-category">
                  <input
                    className="form-input"
                    autoFocus
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitCategoryFromForm()
                      }
                      if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName('') }
                    }}
                  />
                  <button
                    type="button"
                    className="btn-outline btn-outline--sm"
                    onClick={() => { setAddingCategory(false); setNewCategoryName('') }}
                    title="Cancel — no category will be added"
                  >
                    <Icon name="close" />
                  </button>
                </div>
              )}
              {addingCategory && (
                <p className="todo-new-category__hint">
                  Press Enter, or just save the task — either way it's added, no extra click needed.
                </p>
              )}
            </div>

            <div className="form-field-group">
              <label className="form-label">Due Date</label>
              <ClearableDateInput className="form-input" 
                value={newTodo.dueDate}
                onChange={e => setNewTodo({ ...newTodo, dueDate: e.target.value })} />
            </div>

            <div className="form-field-group form-field-group--full">
              <label className="form-label">Linked Case</label>
              <Dropdown
                className="form-input"
                value={newTodo.caseId}
                placeholder="No case"
                onChange={e => setNewTodo({ ...newTodo, caseId: e.target.value })}
              >
                <option value="">No case</option>
                {cases.map(c => <option key={c.id} value={String(c.id)}>{caseOptionLabel(c)}</option>)}
              </Dropdown>
            </div>

            <div className="form-field-group form-field-group--full">
              <div className="form-actions">
                <button type="button" className="btn-outline" onClick={closeAdd}>Cancel</button>
                <button type="button" className="btn-gold" onClick={handleAddTodo}>Add Task</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search box, status filter and sort dropdown */}
      <div className="todo-filter-bar">
        <SearchInput placeholder="Search tasks…" value={searchQuery} onChange={setSearchQuery} />

        <div className="todo-filters">
          <Dropdown searchable={false} className="form-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option>All</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </Dropdown>

          <Dropdown searchable={false} className="form-input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="date">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="dueDate">Due Date</option>
          </Dropdown>
        </div>
      </div>

      {/* Category sidebar on the left, task list on the right */}
      <div className="todo-body">
        {/* Category sidebar */}
        <aside className="todo-sidebar">
          <div className="todo-sidebar__head">
            <p className="todo-sidebar__heading">Categories <span className="todo-sidebar__heading-count">{categoryList.length}</span></p>
            <button
              type="button"
              className="btn-outline btn-outline--sm todo-sidebar__add-btn"
              aria-label="Add category"
              title="Add category"
              onClick={() => (sidebarAdding ? closeSidebarAdd() : setSidebarAdding(true))}
            >
              {sidebarAdding ? <Icon name="close" /> : '+ Add'}
            </button>
          </div>
          {sidebarAdding && (
            <div className="todo-sidebar__add">
              <input
                className="form-input"
                autoFocus
                maxLength={100}
                placeholder="New category name"
                value={sidebarCategoryName}
                onChange={e => setSidebarCategoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitSidebarCategory() }
                  if (e.key === 'Escape') closeSidebarAdd()
                }}
              />
              <button type="button" className="btn-gold btn-outline--sm" onClick={commitSidebarCategory}>Add</button>
            </div>
          )}
          <nav className="todo-sidebar__nav">
            <button
              className={`todo-sidebar__item${selectedCategory === 'All' ? ' active' : ''}`}
              onClick={() => setSelectedCategory('All')}
            >
              <span className="nav-item__icon"><Icon name="folders" /></span>
              <span className="todo-sidebar__label">All Tasks</span>
              <span className="todo-sidebar__count">{statusAndSearchFiltered.length}</span>
            </button>
            <div className="todo-sidebar__divider" role="separator" />

            {/* One button per category */}
            {categoryList.map(({ name, count }) => (
              <div key={name} className="todo-sidebar__row">
                <button
                  className={`todo-sidebar__item${selectedCategory === name ? ' active' : ''}`}
                  onClick={() => setSelectedCategory(name)}
                >
                  <span className="nav-item__icon">{name === UNCATEGORIZED ? <Icon name="pin" /> : <Icon name="tag" />}</span>
                  <span className="todo-sidebar__label" title={name}>{name}</span>
                  <span className="todo-sidebar__count">{count}</span>
                </button>
                {name !== UNCATEGORIZED && (
                  <button
                    type="button"
                    className="btn-icon btn-icon--danger todo-sidebar__delete"
                    aria-label={`Delete ${name} category`}
                    title={`Delete ${name} category`}
                    onClick={() => removeCategory(name)}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Task list for the selected category */}
        <div className="todo-main">
          {/* Category title with a Remove Category button (not for All or General) */}
          {selectedCategory !== 'All' && selectedCategory !== UNCATEGORIZED && (
            <div className="todo-main__category-bar">
              <h3 className="todo-main__category-title">
                <span className="nav-item__icon"><Icon name="tag" /></span> {selectedCategory}
              </h3>
              <button type="button"
                className="btn-outline btn-outline--sm btn-outline--danger"
                onClick={() => removeCategory(selectedCategory)}
                title="Remove this category — its tasks move to General"
              >
                <Icon name="trash" /> Remove Category
              </button>
            </div>
          )}

          {/* Empty state, otherwise the task list */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon"><Icon name="check" duotone /></div>
              <p className="empty-state__title">All caught up!</p>
              <p className="empty-state__desc">No tasks match your filters</p>
            </div>
          ) : (
            <div className="todo-list">
              {/* One row per task: checkbox, title, description, status, category, due date and delete button */}
              {visibleTodos.map(todo => (
                <div key={todo.id} className={`todo-item todo-item--${todo.status.replace(' ', '-').toLowerCase()}`}>
                  <div className="todo-item__checkbox">
                    <input type="checkbox" checked={todo.status === 'Completed'}
                      onChange={() => toggleStatus(todo.id)} />
                  </div>

                  <div className="todo-item__content">
                    <div className="todo-item__header">
                      <h4 className="todo-item__title">{todo.title}</h4>
                    </div>
                    {todo.description && <p className="todo-item__desc"><Linkify text={todo.description} /></p>}
                    <div className="todo-item__footer">
                      <span className="todo-status">{todo.status}</span>
                      {selectedCategory === 'All' && (
                        <span className="todo-category-tag">{categoryOf(todo)}</span>
                      )}
                      {caseById.get(todo.caseId) && (
                        <button
                          type="button"
                          className="todo-case-tag"
                          title="Open case details"
                          onClick={() => openCaseWindow(caseById.get(todo.caseId))}
                        >
                          <Icon name="clip" /> {caseById.get(todo.caseId).title}
                        </button>
                      )}
                      {todo.dueDate && (
                        <span className={`todo-due-date${todo.status !== 'Completed' && new Date(todo.dueDate) < new Date(new Date().toDateString()) ? ' todo-due-date--overdue' : ''}`}>
                          <Icon name="calendar" /> {new Date(todo.dueDate).toLocaleDateString('en-IN')}
                        </span>
                      )}
                    </div>
                    {linkingId === todo.id && (
                      <div className="todo-link-editor">
                        <Dropdown
                          className="form-input"
                          value={todo.caseId ? String(todo.caseId) : ''}
                          placeholder="No case"
                          onChange={e => changeLink(todo, e.target.value)}
                        >
                          <option value="">No case</option>
                          {cases.map(c => <option key={c.id} value={String(c.id)}>{caseOptionLabel(c)}</option>)}
                        </Dropdown>
                      </div>
                    )}
                  </div>

                  <div className="todo-item__actions">
                    <button
                      type="button"
                      aria-label="Link to a case"
                      title={todo.caseId ? 'Change or remove the linked case' : 'Link to a case'}
                      className={`btn-icon${linkingId === todo.id ? ' todo-item__link-btn--active' : ''}`}
                      onClick={() => setLinkingId(linkingId === todo.id ? null : todo.id)}
                    >
                      <Icon name="clip" />
                    </button>
                    <button type="button" aria-label="Delete task" title="Delete task" className="btn-icon" onClick={() => deleteTodo(todo.id)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              ))}
              <SeeMore remaining={tasksRemaining} onClick={showMoreTasks} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
