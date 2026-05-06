function initPlaylist(currentVideoId, mode) {
    const urlParams = new URLSearchParams(window.location.search);
    const playlist = urlParams.get('playlist');
    if (playlist !== 'fav') return;

    const favoritesRaw = localStorage.getItem('tensaitubefavorites');
    let playlistItems = [];
    try {
        playlistItems = JSON.parse(favoritesRaw || '[]');
    } catch (e) {
        console.error('Failed to parse favorites:', e);
        return;
    }
    if (!Array.isArray(playlistItems) || playlistItems.length === 0) return;

    const currentIndex = playlistItems.findIndex(item => item && item.videoId === currentVideoId);
    if (currentIndex === -1) return;

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // プレイリストUI
    const playlistContainer = document.createElement('div');
    playlistContainer.id = 'playlistContainer';
    playlistContainer.className = 'mt-4';
    playlistContainer.style.cssText = 'background:rgba(20,20,20,0.95);border:1px solid rgba(88,101,242,0.18);border-radius:10px;padding:12px;';

    // タイトルと前へ/次へ
    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    controlsDiv.innerHTML = `
        <span style="font-weight:700;color:#fff;font-size:0.95rem;">プレイリスト: お気に入り</span>
        <div style="display:flex;gap:6px;">
            <button id="playlistPrev" style="padding:4px 10px;background:#444;color:#fff;border:none;border-radius:4px;font-size:0.8rem;cursor:pointer;">前へ</button>
            <button id="playlistNext" style="padding:4px 10px;background:#444;color:#fff;border:none;border-radius:4px;font-size:0.8rem;cursor:pointer;">次へ</button>
        </div>
    `;
    playlistContainer.appendChild(controlsDiv);

    // 一覧
    const listDiv = document.createElement('div');
    listDiv.style.cssText = 'max-height:300px;overflow-y:auto;';
    playlistItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'playlist-item';
        itemDiv.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;cursor:pointer;margin-bottom:4px;';
        if (index === currentIndex) {
            itemDiv.style.border = '2px solid #5865F2';
            itemDiv.style.background = 'rgba(88,101,242,0.1)';
        } else {
            itemDiv.style.border = '2px solid transparent';
        }
        itemDiv.innerHTML = `
            <img src="/gen/back/vi/${escapeHtml(item.videoId)}/mqdefault.jpg" alt="" style="width:64px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0;">
            <span style="font-size:0.8rem;color:#dcddde;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.videoTitle || '無題')}</span>
        `;
        itemDiv.addEventListener('click', () => {
            window.location.href = buildPlaylistUrl(item.videoId, mode);
        });
        listDiv.appendChild(itemDiv);
    });
    playlistContainer.appendChild(listDiv);

    // サイドバー上部に挿入（コントロールボタンの下あたり）
    const toggleBtn = sidebar.querySelector('button');
    if (toggleBtn) {
        toggleBtn.insertAdjacentElement('afterend', playlistContainer);
    } else {
        sidebar.insertBefore(playlistContainer, sidebar.firstChild);
    }

    // 前へ/次へ制御
    const prevBtn = document.getElementById('playlistPrev');
    const nextBtn = document.getElementById('playlistNext');
    if (prevBtn) {
        prevBtn.disabled = currentIndex <= 0;
        prevBtn.style.opacity = currentIndex <= 0 ? '0.5' : '1';
        prevBtn.style.cursor = currentIndex <= 0 ? 'not-allowed' : 'pointer';
    }
    if (nextBtn) {
        nextBtn.disabled = currentIndex >= playlistItems.length - 1;
        nextBtn.style.opacity = currentIndex >= playlistItems.length - 1 ? '0.5' : '1';
        nextBtn.style.cursor = currentIndex >= playlistItems.length - 1 ? 'not-allowed' : 'pointer';
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) {
                window.location.href = buildPlaylistUrl(playlistItems[currentIndex - 1].videoId, mode);
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentIndex < playlistItems.length - 1) {
                window.location.href = buildPlaylistUrl(playlistItems[currentIndex + 1].videoId, mode);
            }
        });
    }

    // 自動遷移（nocookie 以外）
    if (mode !== 'nocookie') {
        let videoEl = null;
        if (mode === 'normal') {
            videoEl = document.getElementById('video');
        } else if (mode === 'invidious') {
            videoEl = document.getElementById('invVideo');
        }
        if (videoEl) {
            videoEl.addEventListener('ended', () => {
                if (currentIndex < playlistItems.length - 1) {
                    window.location.href = buildPlaylistUrl(playlistItems[currentIndex + 1].videoId, mode);
                }
            });
        }
    }

    patchModeSwitchLinks();
}

function buildPlaylistUrl(videoId, mode) {
    if (mode === 'normal') {
        return `/gen/watch/${encodeURIComponent(videoId)}?playlist=fav`;
    } else if (mode === 'nocookie') {
        return `/gen/yt/nocookie/${encodeURIComponent(videoId)}?playlist=fav`;
    } else if (mode === 'invidious') {
        return `/gen/yt/invidious/${encodeURIComponent(videoId)}?playlist=fav`;
    }
    return `/gen/watch/${encodeURIComponent(videoId)}?playlist=fav`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function patchModeSwitchLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const playlist = urlParams.get('playlist');
    if (!playlist) return;

    document.querySelectorAll('a[href^="/gen/watch/"], a[href^="/gen/yt/nocookie/"], a[href^="/gen/yt/invidious/"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.includes('playlist=')) {
            const sep = href.includes('?') ? '&' : '?';
            link.setAttribute('href', `${href}${sep}playlist=${encodeURIComponent(playlist)}`);
        }
    });

    document.querySelectorAll('button[onclick*="location.href"]').forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (!onclick || onclick.includes('playlist=')) return;
        const match = onclick.match(/window\.location\.href\s*=\s*['"`]([^'"`]+)['"`]/);
        if (match && match[1]) {
            const url = match[1];
            if (!url.includes('playlist=')) {
                const sep = url.includes('?') ? '&' : '?';
                const newUrl = `${url}${sep}playlist=${encodeURIComponent(playlist)}`;
                btn.setAttribute('onclick', onclick.replace(url, newUrl));
            }
        }
    });
}
