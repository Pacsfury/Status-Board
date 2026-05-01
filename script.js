const menuScreen = document.getElementById('menu-screen');
const boardScreen = document.getElementById('board-screen');
const boardsList = document.getElementById('boards-list');
const inpName = document.getElementById('inp_name');
// const editorDisplayTitle = document.getElementById('editor-display-title');

let workspaceHandle = null;
let activeFileHandle = null;

// 1. SELECT AND LOAD IMMEDIATELY
document.getElementById('btn_select_folder').onclick = async () => {
    try {
        // Open picker
        workspaceHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        
        // CLEAR AND LOAD NOW
        boardsList.innerHTML = ''; 
        
        for await (const entry of workspaceHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `<div style="font-size:40px">📘</div><br><b>${entry.name.replace('.json','')}</b>`;
                card.onclick = () => openBoard(entry);
                boardsList.appendChild(card);
            }
        }
        
        // Save handle to IndexedDB for persistence (background task)
        const db = await openDB();
        db.transaction("config", "readwrite").objectStore("config").put(workspaceHandle, "folder");

    } catch (e) {
        console.error("FAILED TO LOAD:", e);
        alert("Error loading folder. Make sure you are using Chrome/Edge and a local server.");
    }
};

// 2. OPEN BOARD
async function openBoard(handle) {
    activeFileHandle = handle;
    const name = handle.name.replace('.json','');
    inpName.value = name;
    // editorDisplayTitle.innerText = "Board: " + name;
    document.title = "Board Processor - Editor";

    document.querySelectorAll('.task-list').forEach(l => l.innerHTML = '');
    
    const file = await handle.getFile();
    const tasks = JSON.parse(await file.text() || "[]");
    tasks.forEach(t => renderCard(t.id, t.text, t.col));

    menuScreen.style.display = 'none';
    boardScreen.style.display = 'block';
}

// 3. CREATE NEW BOARD
document.getElementById('btn_new_board').onclick = async () => {
    if(!workspaceHandle) return alert("Select folder first!");
    const name = prompt("Name?");
    if(!name) return;
    const handle = await workspaceHandle.getFileHandle(`${name}.json`, {create: true});
    const writable = await handle.createWritable();
    await writable.write("[]");
    await writable.close();
    
    // Trigger reload manually
    document.getElementById('btn_select_folder').click();
};

// 4. KANBAN LOGIC
function renderCard(id, text, colId) {
    const card = document.createElement('div');
    card.id = id;
    card.className = 'task-card';
    card.contentEditable = true;
    card.draggable = true;
    card.innerText = text;
    card.onblur = save;
    card.ondragstart = e => { e.dataTransfer.setData('text', e.target.id); card.classList.add('dragging'); };
    card.ondragend = () => card.classList.remove('dragging');
    const list = document.querySelector(`#${colId} .task-list`);
    if(list) list.appendChild(card);
}

async function save() {
    if(!activeFileHandle) return;
    const data = [];
    document.querySelectorAll('.task-card').forEach(c => {
        data.push({ id: c.id, text: c.innerText, col: c.closest('.column').id });
    });
    const writable = await activeFileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
}

// 5. NAVIGATION & DRAG/DROP
document.getElementById('btn_new_task').onclick = () => {
    renderCard('t' + Date.now(), 'New task...', 'todo');
    save();
};

document.getElementById('btn_menu_back').onclick = () => {
    boardScreen.style.display = 'none';
    menuScreen.style.display = 'block';
    document.title = "Board Processor - Menu";
};

document.querySelectorAll('.column').forEach(col => {
    col.ondragover = e => e.preventDefault();
    col.ondrop = e => {
        const id = e.dataTransfer.getData('text');
        const card = document.getElementById(id);
        if(card) { col.querySelector('.task-list').appendChild(card); save(); }
    };
});

// inpName.oninput = () => { editorDisplayTitle.innerText = "Board: " + inpName.value; };

// Helper for DB
function openDB() {
    return new Promise(res => {
        const req = indexedDB.open("BoardProcessorDB", 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore("config");
        req.onsuccess = e => res(e.target.result);
    });
}

// Re-ask permission on reload
window.onload = async () => {
    const db = await openDB();
    const handle = await new Promise(res => {
        db.transaction("config").objectStore("config").get("folder").onsuccess = e => res(e.target.result);
    });
    if(handle) {
        workspaceHandle = handle;
        if(await workspaceHandle.queryPermission({mode: 'readwrite'}) === 'granted') {
            // Trigger load if already has permission
            for await (const entry of workspaceHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const card = document.createElement('div');
                    card.className = 'card';
                    card.innerHTML = `<div style="font-size:40px">📘</div><br><b>${entry.name.replace('.json','')}</b>`;
                    card.onclick = () => openBoard(entry);
                    boardsList.appendChild(card);
                }
            }
        }
    }
};