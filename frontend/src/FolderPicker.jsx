import { useState, useEffect } from 'react'

export default function FolderPicker({ type, onSelect, onCancel }) {
  const [currentPath, setCurrentPath] = useState(type === 'remote' ? 'root' : '')
  const [pathHistory, setPathHistory] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState(null)
  
  const [isCreating, setIsCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  
  const API_URL = 'http://127.0.0.1:8001'

  useEffect(() => {
    fetchFolders(currentPath)
  }, [currentPath, type])

  const fetchFolders = (pathOrId) => {
    setLoading(true)
    setError(null)
    const url = type === 'remote' 
      ? `${API_URL}/folders/remote?parent_id=${encodeURIComponent(pathOrId)}`
      : `${API_URL}/folders/local${pathOrId ? `?path=${encodeURIComponent(pathOrId)}` : ''}`
      
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.detail) {
          setError(data.detail)
        } else {
          setFolders(data.folders || [])
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  const navigateTo = (pathOrId, folderName = '') => {
    setPathHistory(prev => [...prev, { path: currentPath, name: folderName || currentPath }])
    setCurrentPath(pathOrId)
    setSelectedFolder(null)
  }

  const navigateUp = () => {
    if (pathHistory.length === 0) return
    const prev = pathHistory[pathHistory.length - 1]
    setPathHistory(prevHistory => prevHistory.slice(0, -1))
    setCurrentPath(prev.path)
    setSelectedFolder(null)
  }

  const navigateToRoot = () => {
    setPathHistory([])
    setCurrentPath(type === 'remote' ? 'root' : '')
    setSelectedFolder(null)
  }

  const handleSelect = () => {
    if (selectedFolder) {
      onSelect(selectedFolder)
    }
  }

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return
    setCreateLoading(true)
    fetch(`${API_URL}/folders/remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newFolderName.trim(),
        parent_id: currentPath
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setIsCreating(false)
          setNewFolderName('')
          fetchFolders(currentPath) // Refresh list
        } else {
          setError(data.message || 'Failed to create folder')
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setCreateLoading(false))
  }

  return (
    <div className="folder-picker modal">
      <div className="modal-content">
        <h3>Select {type === 'remote' ? 'Google Drive' : 'Local'} Folder</h3>
        
        <div className="picker-path">
          <button className="btn text small" onClick={navigateToRoot}>
            {type === 'remote' ? 'Drive Root' : 'Local Root'}
          </button>
          
          {pathHistory.length > 0 && (
            <button className="btn text small" onClick={navigateUp}>
              ↑ Up One Level
            </button>
          )}

          <span className="current-path-text" style={{marginLeft: 'auto'}}>
            {type === 'local' ? currentPath : (pathHistory.length > 0 ? pathHistory[pathHistory.length - 1].name : '')}
          </span>
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="folder-list">
          {loading ? (
            <div className="spinner"></div>
          ) : (
            <>
              {type === 'local' || currentPath !== 'root' ? (
                <ul>
                  {folders.length === 0 && <li>No folders found.</li>}
                  {folders.map(f => {
                    const id = type === 'remote' ? f.id : f.path
                    const isFolder = f.mimeType === 'application/vnd.google-apps.folder' || f.mimeType === undefined;
                    const isSelected = selectedFolder?.id === id || selectedFolder?.path === id
                    return (
                      <li 
                        key={id} 
                        className={isSelected ? 'selected' : ''}
                        onClick={() => isFolder && setSelectedFolder(f)}
                        onDoubleClick={() => isFolder && navigateTo(id, f.name)}
                        style={{ 
                          cursor: isFolder ? 'pointer' : 'default',
                          opacity: isFolder ? 1 : 0.5,
                          textAlign: 'left'
                        }}
                      >
                        {isFolder ? '📁' : '📄'} {f.name}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <>
                  <h4 className="drive-section-header">Personal Drive</h4>
                  <ul>
                    {folders.filter(f => f.group === 'personal').length === 0 && <li style={{color: 'var(--text-muted)'}}>No personal folders found.</li>}
                    {folders.filter(f => f.group === 'personal').map(f => {
                      const id = f.id
                      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                      const isSelected = selectedFolder?.id === id
                      return (
                        <li 
                          key={id} 
                          className={isSelected ? 'selected' : ''}
                          onClick={() => isFolder && setSelectedFolder(f)}
                          onDoubleClick={() => isFolder && navigateTo(id, f.name)}
                          style={{ cursor: isFolder ? 'pointer' : 'default', opacity: isFolder ? 1 : 0.5, textAlign: 'left' }}
                        >
                          {isFolder ? '📁' : '📄'} {f.name}
                        </li>
                      )
                    })}
                  </ul>
                  <h4 className="drive-section-header corporate">Corporate & Shared Drives</h4>
                  <ul>
                    {folders.filter(f => f.group === 'shared').length === 0 && <li style={{color: 'var(--text-muted)'}}>No shared folders found.</li>}
                    {folders.filter(f => f.group === 'shared').map(f => {
                      const id = f.id
                      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                      const isSelected = selectedFolder?.id === id
                      return (
                        <li 
                          key={id} 
                          className={isSelected ? 'selected' : ''}
                          onClick={() => isFolder && setSelectedFolder(f)}
                          onDoubleClick={() => isFolder && navigateTo(id, f.name)}
                          style={{ cursor: isFolder ? 'pointer' : 'default', opacity: isFolder ? 1 : 0.5, textAlign: 'left' }}
                        >
                          {isFolder ? '📁' : '📄'} {f.name}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        {type === 'remote' && (
          <div className="create-folder-section">
            {isCreating ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--primary-color)', fontWeight: '600' }}>
                  ↳ Creating folder inside: {pathHistory.length > 0 ? pathHistory[pathHistory.length - 1].name : (currentPath === 'root' ? 'Google Drive Root' : currentPath)}
                </div>
                <div className="create-folder-inputs">
                  <input 
                    type="text" 
                    placeholder="New folder name..." 
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    autoFocus
                  />
                  <button className="btn primary small" onClick={handleCreateFolder} disabled={createLoading || !newFolderName.trim()}>
                    {createLoading ? '...' : 'Save'}
                  </button>
                  <button className="btn text small" onClick={() => setIsCreating(false)} disabled={createLoading}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn secondary small" onClick={() => setIsCreating(true)}>
                + New Folder
              </button>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn text" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!selectedFolder} onClick={handleSelect}>Select Folder</button>
        </div>
      </div>
    </div>
  )
}
