import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, RefreshCw, UsersRound } from 'lucide-react';
import { useWindow } from '../../context/WindowContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import EntityTree from './components/EntityTree';
import EntitiesTable from './components/EntitiesTable';
import EntityEditor from './components/EntityEditor';
import EntityImporter from './components/EntityImporter';
import s from './EntitiesWorkspace.module.css';

const ENTITY_LABELS = {
    client: 'Clientes',
    provider: 'Proveedores',
    mixed: 'Clientes y proveedores',
    employee: 'Empleados'
};

export default function EntitiesManager({ initialType = 'client', startNew = false, onCreated, windowId }) {
    const { closeWindow } = useWindow();
    const { showToast } = useToast();
    const [selectedType, setSelectedType] = useState(initialType);
    const [entities, setEntities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [isEditing, setIsEditing] = useState(Boolean(startNew));
    const [isImporting, setIsImporting] = useState(false);
    const [editorDirty, setEditorDirty] = useState(false);

    const refresh = useCallback(() => setReloadKey(key => key + 1), []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setFetchError('');
        api.get('/entities/', {
            params: { type: selectedType, q: debouncedSearch, limit: 2000 },
            signal: controller.signal
        })
            .then(data => {
                if (!controller.signal.aborted) setEntities(Array.isArray(data) ? data : []);
            })
            .catch(error => {
                if (controller.signal.aborted) return;
                console.error('Error al cargar entidades', error);
                setFetchError('No se pudo consultar el padrón. Revisá la conexión y tus permisos.');
                setEntities([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [selectedType, debouncedSearch, reloadKey]);

    const selectType = type => {
        if (isEditing && editorDirty && !window.confirm('Tenés cambios sin guardar. ¿Querés cambiar de categoría?')) return;
        setEditorDirty(false);
        setSelectedType(type);
        setSelectedEntity(null);
        setIsEditing(false);
        setSearchQuery('');
        setDebouncedSearch('');
    };

    const closeEditor = () => {
        if (editorDirty && !window.confirm('Tenés cambios sin guardar. ¿Querés salir de la ficha?')) return;
        setEditorDirty(false);
        setIsEditing(false);
        setSelectedEntity(null);
    };

    const handleSave = saved => {
        setEditorDirty(false);
        const creating = !selectedEntity;
        refresh();
        setIsEditing(false);
        setSelectedEntity(null);
        if (saved && creating && startNew && typeof onCreated === 'function') {
            onCreated(saved);
            if (windowId) closeWindow(windowId);
        }
        showToast(saved ? (creating ? 'Entidad creada correctamente.' : 'Entidad actualizada correctamente.') : 'Entidad eliminada.', 'success');
    };

    const editingTitle = selectedEntity?.name || ('Nueva ' + (selectedType === 'provider' ? 'ficha de proveedor' : selectedType === 'employee' ? 'ficha de empleado' : 'ficha de cliente'));

    return (
        <section className={s.workspace} aria-label="Gestión de entidades">
            <header className={s.header}>
                <div className={s.headerIdentity}>
                    <span className={s.headerIcon}><Building2 size={21} /></span>
                    <div>
                        <div className={s.eyebrow}>Quintal Agross / Administración</div>
                        <h1 className={s.heading}>Entidades</h1>
                        <p className={s.subtitle}>Padrón único de clientes, proveedores y empleados.</p>
                    </div>
                </div>
                <div className={s.headerActions}>
                    <span className={s.headerPill}><UsersRound size={14} /> {ENTITY_LABELS[selectedType] || 'Entidades'}</span>
                    <button type="button" className={s.iconButton} onClick={refresh} title="Actualizar datos" aria-label="Actualizar entidades" disabled={loading}>
                        <RefreshCw size={16} className={loading ? s.spinning : undefined} />
                    </button>
                </div>
            </header>

            <div className={s.layout}>
                <aside className={s.sidebar} aria-label="Categorías de entidades">
                    <EntityTree selectedId={selectedType} onSelect={selectType} />
                </aside>
                <main className={s.mainPanel}>
                    {isEditing ? (
                        <>
                            <div className={s.editorHeading}>
                                <button type="button" className={s.backButton} onClick={closeEditor}>
                                    <ArrowLeft size={17} /> Volver al listado
                                </button>
                                <div className={s.editorHeadingText}>
                                    <span className={s.editorOverline}>{selectedEntity ? 'Editar ficha' : 'Alta de entidad'}</span>
                                    <h2 title={editingTitle}>{editingTitle}</h2>
                                </div>
                            </div>
                            <div className={s.editorHost}>
                                <EntityEditor
                                    key={selectedEntity?.id || 'new-' + selectedType}
                                    entity={selectedEntity}
                                    initialType={selectedType === 'mixed' ? 'client' : selectedType}
                                    onSave={handleSave}
                                    onCancel={closeEditor}
                                    onDirtyChange={setEditorDirty}
                                    onSelectExisting={existing => {
                                        setSelectedEntity(existing);
                                        if (existing.type === 'mixed' || existing.type === 'employee') setSelectedType(existing.type);
                                        refresh();
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <EntitiesTable
                            entities={entities}
                            loading={loading}
                            error={fetchError}
                            selectedType={selectedType}
                            searchQuery={searchQuery}
                            onSearch={setSearchQuery}
                            onSelect={entity => { setEditorDirty(false); setSelectedEntity(entity); setIsEditing(true); }}
                            onNew={() => { setEditorDirty(false); setSelectedEntity(null); setIsEditing(true); }}
                            onImport={() => setIsImporting(true)}
                            onRefresh={refresh}
                        />
                    )}
                </main>
            </div>

            {isImporting && (
                <div className={s.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setIsImporting(false); }}>
                    <div role="dialog" aria-modal="true" aria-label="Importar entidades desde Excel" className={s.modal}>
                        <EntityImporter
                            initialType={selectedType}
                            onImportSuccess={() => { refresh(); }}
                            onCancel={() => setIsImporting(false)}
                        />
                    </div>
                </div>
            )}
        </section>
    );
}
