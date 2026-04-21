import { useState, useEffect } from 'react'
import FolderPicker from './FolderPicker'
import CloudExplorer from './CloudExplorer'
import logoImg from './assets/logo.png'
import packageJson from '../package.json'
import './App.css'

function App() {
  const [authStatus, setAuthStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('Idle')
  const [mappingsCount, setMappingsCount] = useState(0)
  const [evictionResult, setEvictionResult] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [isSyncActive, setIsSyncActive] = useState(false)
  const [isSyncPaused, setIsSyncPaused] = useState(false)
  const [activeTab, setActiveTab] = useState('status')
  
  const [syncProgress, setSyncProgress] = useState(0)
  const [currentSyncFile, setCurrentSyncFile] = useState(null)
  
  const [mappings, setMappings] = useState([])
  const [showPicker, setShowPicker] = useState(null) // 'local' or 'remote'
  const [newMapping, setNewMapping] = useState({ name: '', local: null, remote: null })
  const [editingMappingId, setEditingMappingId] = useState(null)
  
  const [selectiveRestoreModalOpen, setSelectiveRestoreModalOpen] = useState(false)
  const [selectiveRestoreMappingId, setSelectiveRestoreMappingId] = useState(null)
  const [remoteTree, setRemoteTree] = useState([])
  const [selectedFileIds, setSelectedFileIds] = useState([])
  const [treeLoading, setTreeLoading] = useState(false)
  
  const [runLogs, setRunLogs] = useState([])
  
  const [settings, setSettings] = useState({
    sync_interval_minutes: 0,
    eviction_days_threshold: 30,
    exclude_extensions: '.tmp, .log, .download',
    exclude_folders: '.git, .venv, node_modules',
    theme: 'light'
  })

  const API_URL = 'http://127.0.0.1:8001'

  useEffect(() => {
    checkAuth()
    
    // Connect WebSocket
    let ws;
    const connectWs = () => {
      ws = new WebSocket('ws://127.0.0.1:8001/ws/progress')
      ws.onmessage = (event) => {
          try {
              const payload = JSON.parse(event.data)
              if (payload.status === "complete_push" || payload.status === "complete_restore") {
                  let pushMsg = `Successfully ${payload.status === 'complete_push' ? 'pushed' : 'restored'} ${payload.success_count} files.`
                  if (payload.failed_count > 0) {
                      pushMsg += `\nWARNING: ${payload.failed_count} files failed.`
                  }
                  
                  // Avoid native alert() which freezes Electron's UI thread and hides the 100% render
                  setCurrentSyncFile("✅ " + pushMsg)
                  setSyncProgress(100)
                  
                  setTimeout(() => {
                      setIsSyncActive(false)
                      setIsSyncPaused(false)
                      setSyncStatus('Idle')
                      setSyncProgress(0)
                      setCurrentSyncFile(null)
                      fetchSyncStatus()
                  }, 4000)
              } else if (payload.status === "error") {
                  setCurrentSyncFile("❌ Error: " + payload.message)
                  setSyncProgress(100)
                  setTimeout(() => {
                      setIsSyncActive(false)
                      setIsSyncPaused(false)
                      setSyncStatus('Idle')
                      setSyncProgress(0)
                      setCurrentSyncFile(null)
                  }, 5000)
              } else if (payload.mode === "paused") {
                  setIsSyncPaused(true)
                  setCurrentSyncFile(payload.current)
              } else if (payload.mode === "scanning") {
                  setSyncProgress(undefined)
                  setCurrentSyncFile(payload.current)
              } else if (payload.progress !== undefined) {
                  setSyncProgress(payload.progress)
                  setIsSyncPaused(false)
                  if (payload.current) {
                      setCurrentSyncFile(payload.current)
                  }
              }
          } catch(e) {}
      }
      ws.onclose = () => setTimeout(connectWs, 3000)
    }
    connectWs()
    return () => { if (ws) ws.close() }
  }, [])

  const checkAuth = (retryCount = 0) => {
    setLoading(true)
    fetch(`${API_URL}/auth/status`)
      .then(res => res.json())
      .then(data => {
        setAuthStatus(data.authenticated)
        if (data.authenticated) {
          fetchSyncStatus()
        }
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        if (retryCount < 20) {
          setTimeout(() => checkAuth(retryCount + 1), 1000)
        } else {
          setAuthStatus(false)
          setLoading(false)
        }
      })
  }

  const fetchSyncStatus = () => {
    fetch(`${API_URL}/sync/status`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'idle') {
          setSyncStatus('Idle')
          setMappingsCount(data.mappings_count)
        }
      })
      .catch(console.error)
  }

  const fetchMappings = () => {
    fetch(`${API_URL}/mappings`)
      .then(res => res.json())
      .then(data => setMappings(data))
      .catch(console.error)
  }

  const fetchSettings = () => {
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(data => {
        const storedTheme = localStorage.getItem('theme') || 'light'
        setSettings({
          sync_interval_minutes: data.sync_interval_minutes || 0,
          eviction_days_threshold: data.eviction_days_threshold || 30,
          exclude_extensions: (data.exclude_extensions || []).join(', '),
          exclude_folders: (data.exclude_folders || ['.git', '.venv', 'node_modules']).join(', '),
          theme: storedTheme
        })
        applyTheme(storedTheme)
      })
      .catch(console.error)
  }

  const fetchLogs = () => {
    fetch(`${API_URL}/logs`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRunLogs(data)
        } else {
          console.error('Expected array of logs but got:', data)
          setRunLogs([])
        }
      })
      .catch(console.error)
  }

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme')
    } else {
      document.body.classList.remove('dark-theme')
    }
  }

  useEffect(() => {
    if (activeTab === 'mappings' && authStatus) {
      fetchMappings()
    } else if (activeTab === 'settings' && authStatus) {
      fetchSettings()
    } else if (activeTab === 'logs' && authStatus) {
      fetchLogs()
    }
  }, [activeTab, authStatus])

  // Initialize theme on load
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') || 'light'
    applyTheme(storedTheme)
  }, [])

  const handleLogin = () => {
    setActionLoading(true)
    fetch(`${API_URL}/auth/login`)
      .then(res => {
        if (!res.ok && res.status !== 400 && res.status !== 500) {
           return res.json().then(data => { throw new Error(data.detail || `HTTP ${res.status}`) })
        }
        return res.json()
      })
      .then(data => {
        if (data.status === 'success') {
          checkAuth()
        } else {
          alert('Login failed: ' + (data.message || data.detail || 'Unknown error'))
        }
      })
      .catch(err => alert('Error: ' + err.message || err))
      .finally(() => setActionLoading(false))
  }

  const handleLogout = () => {
    setActionLoading(true)
    fetch(`${API_URL}/auth/logout`, { method: 'POST' })
      .then(() => {
        setAuthStatus(false)
      })
      .finally(() => setActionLoading(false))
  }

  const handleSyncPush = (mapping_id = null) => {
    setIsSyncActive(true)
    setSyncStatus('Syncing to Cloud...')
    fetch(`${API_URL}/sync/push`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping_id ? { mapping_id } : {})
    })
      .then(res => res.json())
      .then(data => {
        if (data.status !== 'started' && data.status !== 'success') {
          alert('Sync Error: ' + (data.message || data.detail || 'Unknown error'))
          setIsSyncActive(false)
          setSyncStatus('Idle')
        }
      })
      .catch(err => {
         alert('Error: ' + err)
         setIsSyncActive(false)
         setSyncStatus('Idle')
      })
  }

  const handleSyncRestore = (mappingId = null) => {
    if (!window.confirm("Are you sure you want to perform a Full Folder Restore? This will download files from Google Drive and overwrite local files if they exist.")) return;
    setIsSyncActive(true)
    const body = mappingId ? { mapping_id: mappingId } : {}
    fetch(`${API_URL}/sync/restore`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingId ? { mapping_id: mappingId } : {})
    })
      .then(res => res.json())
      .then(data => {
        if (data.status !== 'started' && data.status !== 'success') {
          alert('Sync Error: ' + (data.message || data.detail || 'Unknown error'))
          setIsSyncActive(false)
          setSyncStatus('Idle')
        }
      })
      .catch(err => {
         alert('Error: ' + err)
         setIsSyncActive(false)
         setSyncStatus('Idle')
      })
  }

  const handleEvict = () => {
    setActionLoading(true)
    fetch(`${API_URL}/sync/evict`, { method: 'POST' })
      .then(res => {
        if (!res.ok && res.status !== 400 && res.status !== 500) {
           return res.json().then(data => { throw new Error(data.detail || `HTTP ${res.status}`) })
        }
        return res.json()
      })
      .then(data => {
        if (data.status === 'success') {
          setEvictionResult(`Evicted ${data.evicted_count} files, saved ${(data.bytes_saved / 1024 / 1024).toFixed(2)} MB.`)
        } else {
          alert('Eviction Error: ' + (data.message || data.detail || 'Unknown error'))
        }
      })
      .catch(err => alert('Error: ' + err.message || err))
      .finally(() => setActionLoading(false))
  }

  const handleSaveMapping = () => {
    if (!newMapping.local || !newMapping.remote) return
    setActionLoading(true)
    fetch(`${API_URL}/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newMapping.name,
        local_path: newMapping.local.path,
        remote_folder_id: newMapping.remote.id,
        remote_folder_name: newMapping.remote.name
      })
    })
      .then(res => res.json())
      .then(() => {
        if (editingMappingId) {
          return fetch(`${API_URL}/mappings/${editingMappingId}`, { method: 'DELETE' })
        }
        return Promise.resolve()
      })
      .then(() => {
        setNewMapping({ name: '', local: null, remote: null })
        setEditingMappingId(null)
        fetchMappings()
        fetchSyncStatus()
      })
      .catch(err => alert('Error saving mapping: ' + err))
      .finally(() => setActionLoading(false))
  }

  const handleEditMapping = (m) => {
    setNewMapping({ 
        name: m.name || '',
        local: { path: m.local_path }, 
        remote: { id: m.remote_folder_id, name: m.remote_folder_name } 
    })
    setEditingMappingId(m.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEdit = () => {
    setNewMapping({ name: '', local: null, remote: null })
    setEditingMappingId(null)
  }

  const handleDeleteMapping = (id) => {
    setActionLoading(true)
    fetch(`${API_URL}/mappings/${id}`, { method: 'DELETE' })
      .then(() => {
        fetchMappings()
        fetchSyncStatus()
      })
      .catch(err => alert('Error deleting mapping: ' + err))
      .finally(() => setActionLoading(false))
  }

  const handleOpenSelectiveRestore = (mappingId) => {
    setSelectiveRestoreMappingId(mappingId)
    setSelectiveRestoreModalOpen(true)
    setTreeLoading(true)
    setSelectedFileIds([])
    fetch(`${API_URL}/sync/remote_tree?mapping_id=${mappingId}`)
      .then(res => res.json())
      .then(data => setRemoteTree(data))
      .catch(err => alert("Error fetching remote tree: " + err))
      .finally(() => setTreeLoading(false))
  }

  const handleRunSelectiveRestore = () => {
    if (selectedFileIds.length === 0) return alert("Select at least one file.")
    setIsSyncActive(true)
    setSelectiveRestoreModalOpen(false)
    fetch(`${API_URL}/sync/restore_selective`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mapping_id: selectiveRestoreMappingId,
        file_ids: selectedFileIds
      })
    })
      .then(res => res.json())
      .then(data => {
        if(data.status === 'started' || data.status === 'success' || data.status === 'Selective restore started') {
            alert('Selective Restore started in background.')
        } else {
            alert('Error: ' + JSON.stringify(data))
            setIsSyncActive(false)
        }
      })
      .catch(err => {
         alert('Restore error: ' + err)
         setIsSyncActive(false)
      })
  }

  const handleSaveSettings = () => {
    setActionLoading(true)
    
    // Save theme to local storage
    localStorage.setItem('theme', settings.theme)
    applyTheme(settings.theme)

    // Save backend settings
    const extArray = settings.exclude_extensions.split(',').map(e => e.trim()).filter(e => e)
    const folderArray = settings.exclude_folders.split(',').map(e => e.trim()).filter(e => e)
    
    fetch(`${API_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync_interval_minutes: parseInt(settings.sync_interval_minutes, 10),
        eviction_days_threshold: parseInt(settings.eviction_days_threshold, 10),
        exclude_extensions: extArray,
        exclude_folders: folderArray
      })
    })
      .then(res => res.json())
      .then(() => {
        alert('Settings saved successfully!')
      })
      .catch(err => alert('Error saving settings: ' + err))
      .finally(() => setActionLoading(false))
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div><p>Connecting to Daemon...</p></div>
  }

  if (!authStatus) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Polyunity Sync</h1>
          <p>Please authenticate with your @polyunity.com account to continue.</p>
          <button className="btn primary" onClick={handleLogin} disabled={actionLoading}>
            {actionLoading ? 'Waiting for Browser...' : 'Login with Google'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="logo" style={{ display: 'flex', justifyContent: 'center' }}>
          <img src={logoImg} alt="Polyunity" style={{ height: '60px', width: 'auto' }} />
        </div>
        <nav>
          <a href="#" className={activeTab === 'status' ? 'active' : ''} onClick={() => setActiveTab('status')}>Status Hub</a>
          <a href="#" className={activeTab === 'mappings' ? 'active' : ''} onClick={() => setActiveTab('mappings')}>Folder Mappings</a>
          <a href="#" className={activeTab === 'explorer' ? 'active' : ''} onClick={() => setActiveTab('explorer')}>Cloud Explorer</a>
          <a href="#" className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>Settings</a>
          <a href="#" className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>Sync Logs</a>
        </nav>
        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button className="btn text full-width" onClick={handleLogout} disabled={actionLoading}>Logout</button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>v{packageJson.version}</span>
        </div>
      </aside>

      <main className="main-content">
        <div className="top-banner">
          <h1>Polyunity Google Drive Sync Tool</h1>
        </div>
        
        {activeTab === 'status' && (
          <>
            <header>
              <h2>Status Hub</h2>
              <div className="status-badge">
                <span className={`dot ${syncStatus.toLowerCase()}`}></span>
                {syncStatus}
              </div>
            </header>

            <div className="cards-grid">
              <div className="card">
                <h3>Cloud Overview</h3>
                <div className="stat">
                  <span className="value">{mappingsCount}</span>
                  <span className="label">Active Folder Mappings</span>
                </div>
                <button className="btn success full-width" onClick={() => handleSyncPush()} disabled={isSyncActive}>
                  {isSyncActive && syncStatus === 'Syncing to Cloud...' ? 'Syncing...' : 'Sync All Folders Now'}
                </button>
              </div>

              <div className="card">
                <h3>Eviction Engine</h3>
                <p className="description">Automatically cleans up files unaccessed for &gt;30 days.</p>
                {evictionResult && <div className="alert success">{evictionResult}</div>}
                <button className="btn warning full-width" onClick={handleEvict} disabled={actionLoading}>
                  Run Eviction Sweep
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'mappings' && (
          <>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Folder Mappings</h2>
              <div className="global-actions">
                <button className="btn success" disabled={isSyncActive} onClick={() => handleSyncPush()}>🟩 Sync All</button>
                <button className="btn danger" disabled={isSyncActive} onClick={() => handleSyncRestore()} style={{ marginLeft: '10px' }}>🟥 Restore All</button>
              </div>
            </header>
            <div className="mappings-container">
              <div className="card add-mapping-card">
                <h3>{editingMappingId ? 'Edit Mapping' : 'Add New Mapping'}</h3>
                <div className="mapping-inputs">
                  <div className="mapping-col" style={{ flex: '1 1 100%' }}>
                    <label>Mapping Name (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g., Marketing Assets"
                      value={newMapping.name}
                      onChange={e => setNewMapping(prev => ({ ...prev, name: e.target.value }))}
                      style={{ padding: '10px', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div className="mapping-inputs">
                  <div className="mapping-col">
                    <label>Local Folder</label>
                    <div className="picker-box" onClick={() => setShowPicker('local')}>
                      {newMapping.local ? `📁 ${newMapping.local.path}` : 'Click to Select'}
                    </div>
                  </div>
                  <div className="mapping-arrow">➔</div>
                  <div className="mapping-col">
                    <label>Google Drive Folder</label>
                    <div className="picker-box" onClick={() => setShowPicker('remote')}>
                      {newMapping.remote ? `☁️ ${newMapping.remote.name}` : 'Click to Select'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    className="btn primary" 
                    disabled={!newMapping.local || !newMapping.remote || actionLoading}
                    onClick={handleSaveMapping}
                  >
                    {editingMappingId ? 'Save Changes' : 'Save Mapping'}
                  </button>
                  {editingMappingId && (
                    <button className="btn secondary" disabled={actionLoading} onClick={handleCancelEdit}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <h3>Current Mappings</h3>
              <div className="mappings-list">
                {mappings.length === 0 && <p className="description">No folders mapped yet.</p>}
                {mappings.map(m => (
                  <div key={m.id} className="mapping-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="mapping-details" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                      <div style={{ flex: 1 }}>
                         {m.name && <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '5px' }}>{m.name}</div>}
                         <div><strong>Local:</strong> {m.local_path}</div>
                         <div><strong>Remote:</strong> {m.remote_folder_name}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
                        <button className="btn text small" onClick={() => handleEditMapping(m)}>Edit</button>
                        <button className="btn text small" onClick={() => handleDeleteMapping(m.id)}>Remove</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                       <button className="btn success full-width" disabled={isSyncActive} onClick={() => handleSyncPush(m.id)}>Normal Sync</button>
                       <button className="btn warning full-width" disabled={isSyncActive} onClick={() => handleOpenSelectiveRestore(m.id)}>Selective Restore</button>
                       <button className="btn danger full-width" disabled={isSyncActive} onClick={() => handleSyncRestore(m.id)}>Full Folder Restore</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'explorer' && <CloudExplorer />}

        {activeTab === 'settings' && (
          <>
            <header>
              <h2>Application Settings</h2>
            </header>
            <div className="cards-grid">
              <div className="card settings-card">
                <h3>Automation</h3>
                <div className="form-group">
                  <label>Background Sync Interval</label>
                  <select 
                    value={settings.sync_interval_minutes} 
                    onChange={e => setSettings({...settings, sync_interval_minutes: e.target.value})}
                  >
                    <option value={0}>Disabled (Manual Only)</option>
                    <option value={15}>Every 15 Minutes</option>
                    <option value={60}>Every 1 Hour</option>
                    <option value={1440}>Every 24 Hours</option>
                  </select>
                  <small>The backend app must be running for background sync to trigger.</small>
                </div>

                <h3>Storage Eviction</h3>
                <div className="form-group">
                  <label>Eviction Threshold (Days)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={settings.eviction_days_threshold}
                    onChange={e => setSettings({...settings, eviction_days_threshold: e.target.value})}
                  />
                  <small>Files unaccessed longer than this threshold will be purged locally.</small>
                </div>

                <h3>File Filters</h3>
                <div className="form-group">
                  <label>Ignored Extensions (Comma separated)</label>
                  <input 
                    type="text" 
                    placeholder=".tmp, .log"
                    value={settings.exclude_extensions}
                    onChange={e => setSettings({...settings, exclude_extensions: e.target.value})}
                  />
                  <small>These files will never be uploaded to Google Drive.</small>
                </div>
                <div className="form-group">
                  <label>Ignored Folders (Comma separated)</label>
                  <input 
                    type="text" 
                    placeholder=".git, node_modules"
                    value={settings.exclude_folders}
                    onChange={e => setSettings({...settings, exclude_folders: e.target.value})}
                  />
                  <small>Directories matching these names will be skipped entirely during scanning.</small>
                </div>

                <h3>Appearance</h3>
                <div className="form-group">
                  <label>UI Theme</label>
                  <select 
                    value={settings.theme} 
                    onChange={e => setSettings({...settings, theme: e.target.value})}
                  >
                    <option value="light">Light Mode</option>
                    <option value="dark">Dark Mode</option>
                  </select>
                </div>

                <div className="settings-actions">
                  <button className="btn primary" onClick={handleSaveSettings} disabled={actionLoading}>
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'logs' && (
          <>
            <header>
              <h2>Sync Activity Logs</h2>
            </header>
            <div className="card" style={{ maxWidth: '100%', overflowX: 'auto' }}>
              {runLogs.length === 0 ? (
                <p className="description">No sync logs recorded yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Date</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Operation</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Status</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Files Scanned</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Successful</th>
                      <th style={{ padding: '10px', whiteSpace: 'nowrap' }}>Skipped/Failed</th>
                      <th style={{ padding: '10px' }}>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runLogs.map((log, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{log.operation}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', color: log.status === 'Success' ? 'var(--primary-color)' : 'var(--error-text)', fontWeight: 'bold' }}>{log.status}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{log.total_marked}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', color: log.success_count > 0 ? '#10b981' : 'inherit', fontWeight: log.success_count > 0 ? 'bold' : 'normal' }}>{log.success_count}</td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', color: log.fail_count > 0 ? 'var(--warning-color)' : 'inherit', fontWeight: log.fail_count > 0 ? 'bold' : 'normal' }}>{log.fail_count}</td>
                        <td style={{ padding: '10px', color: 'var(--error-text)', fontSize: '0.8rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{log.errors || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>

      {showPicker && (
        <FolderPicker 
          type={showPicker} 
          onSelect={(f) => {
            setNewMapping(prev => ({ ...prev, [showPicker]: f }))
            setShowPicker(null)
          }} 
          onCancel={() => setShowPicker(null)} 
        />
      )}

      {selectiveRestoreModalOpen && (
        <div className="modal">
          <div className="modal-content" style={{ width: '600px', maxWidth: '90vw' }}>
            <h3>Select Files to Restore</h3>
            {treeLoading ? (
               <div className="loading-screen" style={{ minHeight: '200px' }}><div className="spinner"></div></div>
            ) : (
               <div className="folder-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                 {remoteTree.length === 0 ? (
                    <p className="description">No files found.</p>
                 ) : (
                    remoteTree.map(file => (
                      <div key={file.id} style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center' }}>
                         <input 
                           type="checkbox" 
                           id={`chk-${file.id}`}
                           checked={selectedFileIds.includes(file.id)}
                           onChange={(e) => {
                             if (e.target.checked) setSelectedFileIds([...selectedFileIds, file.id])
                             else setSelectedFileIds(selectedFileIds.filter(id => id !== file.id))
                           }}
                           style={{ marginRight: '10px' }}
                         />
                         <label htmlFor={`chk-${file.id}`} style={{ flex: 1, wordBreak: 'break-all' }}>{file.path}</label>
                      </div>
                    ))
                 )}
               </div>
            )}
            <div className="modal-actions">
              <button className="btn primary" onClick={handleRunSelectiveRestore} disabled={selectedFileIds.length === 0 || actionLoading}>
                Restore Selected ({selectedFileIds.length})
              </button>
              <button className="btn secondary" onClick={() => setSelectiveRestoreModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isSyncActive && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', width: '400px', backgroundColor: 'var(--surface-color)', backdropFilter: 'var(--glass-blur)', boxShadow: 'var(--glass-shadow)', padding: '15px', borderRadius: '10px', zIndex: 1000, border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <strong style={{color: 'var(--text-main)'}}>{isSyncPaused ? "Sync Paused" : "Sync in Progress"}</strong>
             <div>
                {isSyncPaused ? (
                   <button className="btn success" style={{padding: '4px 8px', fontSize: '0.75rem'}} onClick={() => fetch(`${API_URL}/sync/resume`, {method:'POST'})}>▶ Resume</button>
                ) : (
                   <button className="btn warning" style={{padding: '4px 8px', fontSize: '0.75rem'}} onClick={() => fetch(`${API_URL}/sync/pause`, {method:'POST'})}>⏸ Pause</button>
                )}
                <button className="btn danger" style={{padding: '4px 8px', fontSize: '0.75rem', marginLeft: '5px'}} onClick={() => fetch(`${API_URL}/sync/stop`, {method:'POST'})}>⏹ Cancel</button>
             </div>
          </div>
          <div style={{marginTop: '10px'}}>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                   {currentSyncFile ? (syncProgress === undefined ? currentSyncFile : `Syncing: ${currentSyncFile}`) : 'Preparing...'}
                </span>
                <span>{syncProgress !== undefined ? `${syncProgress}%` : '...'}</span>
             </div>
             {syncProgress === undefined ? (
                 <progress max="100" style={{ width: '100%', height: '8px', marginTop: '5px' }}></progress>
             ) : (
                 <progress value={syncProgress} max="100" style={{ width: '100%', height: '8px', marginTop: '5px' }}></progress>
             )}
          </div>
        </div>
      )}

    </div>
  )
}

export default App
