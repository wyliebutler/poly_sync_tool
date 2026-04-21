import { useState, useEffect } from 'react'

export default function CloudExplorer() {
  const [currentPath, setCurrentPath] = useState('root')
  const [pathHistory, setPathHistory] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const API_URL = 'http://127.0.0.1:8001'

  useEffect(() => {
    fetchFolders(currentPath)
  }, [currentPath])

  const fetchFolders = (pathOrId) => {
    setLoading(true)
    setError(null)
    const url = `${API_URL}/folders/remote?parent_id=${encodeURIComponent(pathOrId)}`
      
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

  const navigateTo = (pathOrId, folderName) => {
    setPathHistory(prev => [...prev, { path: currentPath, name: folderName }])
    setCurrentPath(pathOrId)
  }

  const navigateUp = () => {
    if (pathHistory.length === 0) return
    const prev = pathHistory[pathHistory.length - 1]
    setPathHistory(prevHistory => prevHistory.slice(0, -1))
    setCurrentPath(prev.path)
  }

  const navigateToRoot = () => {
    setPathHistory([])
    setCurrentPath('root')
  }

  return (
    <div className="cloud-explorer">
      <header>
        <h2>Google Drive Explorer</h2>
      </header>

      <div className="card">
        <div className="picker-path" style={{ marginBottom: '20px' }}>
          <button className="btn secondary small" onClick={navigateToRoot}>
            Drive Root
          </button>
          
          {pathHistory.length > 0 && (
            <button className="btn secondary small" onClick={navigateUp}>
              ↑ Up One Level
            </button>
          )}

          <span className="current-path-text" style={{marginLeft: 'auto'}}>
            {pathHistory.length > 0 ? pathHistory[pathHistory.length - 1].name : 'Root Directory'}
          </span>
        </div>

        {error && <div className="alert error">{error}</div>}

        <div className="folder-list" style={{ minHeight: '500px' }}>
          {loading ? (
            <div className="spinner" style={{ margin: 'auto', marginTop: '50px' }}></div>
          ) : (
            <>
              {currentPath !== 'root' ? (
                <ul>
                  {folders.length === 0 && <li style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>This folder is empty.</li>}
                  {folders.map(f => {
                    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                    return (
                      <li 
                        key={f.id} 
                        onDoubleClick={() => isFolder && navigateTo(f.id, f.name)}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '10px', 
                          cursor: isFolder ? 'pointer' : 'default',
                          opacity: isFolder ? 1 : 0.7,
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '1.2rem' }}>{isFolder ? '📁' : '📄'}</span>
                        <span>{f.name}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <>
                  <h4 className="drive-section-header" style={{ marginLeft: '16px' }}>Personal Drive</h4>
                  <ul>
                    {folders.filter(f => f.group === 'personal').length === 0 && <li style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Empty</li>}
                    {folders.filter(f => f.group === 'personal').map(f => {
                      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                      return (
                        <li 
                          key={f.id} 
                          onDoubleClick={() => isFolder && navigateTo(f.id, f.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isFolder ? 'pointer' : 'default', opacity: isFolder ? 1 : 0.7, textAlign: 'left' }}
                        >
                          <span style={{ fontSize: '1.2rem' }}>{isFolder ? '📁' : '📄'}</span>
                          <span>{f.name}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <h4 className="drive-section-header corporate" style={{ marginLeft: '16px' }}>Corporate & Shared Drives</h4>
                  <ul>
                    {folders.filter(f => f.group === 'shared').length === 0 && <li style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Empty</li>}
                    {folders.filter(f => f.group === 'shared').map(f => {
                      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
                      return (
                        <li 
                          key={f.id} 
                          onDoubleClick={() => isFolder && navigateTo(f.id, f.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isFolder ? 'pointer' : 'default', opacity: isFolder ? 1 : 0.7, textAlign: 'left' }}
                        >
                          <span style={{ fontSize: '1.2rem' }}>{isFolder ? '📁' : '📄'}</span>
                          <span>{f.name}</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
          <em>Double-click a folder to navigate inside.</em>
        </p>
      </div>
    </div>
  )
}
