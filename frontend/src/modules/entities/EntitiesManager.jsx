import React, { useState, useEffect } from 'react';
import ContentHeader from '../../components/layout/ContentHeader';
import Button from '../../components/ui/Button';
import EntityTree from './components/EntityTree';
import EntitiesTable from './components/EntitiesTable';
import EntityEditor from './components/EntityEditor';
import EntityImporter from './components/EntityImporter';
import LedgerImporter from './components/LedgerImporter';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import LoadingScreen from '../../components/ui/LoadingScreen';

export default function EntitiesManager({ initialType = 'client' }) {
    const [selectedType, setSelectedType] = useState(initialType);
    const [entities, setEntities] = useState([]);
    const [loading, setLoading] = useState(false); // Changed to false by default
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isImportingSaldos, setIsImportingSaldos] = useState(false);

    useEffect(() => {
        fetchEntities(true); // Always treat as silent load initially?
    }, [selectedType, searchQuery]);

    const fetchEntities = async (isSearch = false) => {
        if (!isSearch) setLoading(true);
        try {
            const data = await api.get(`/entities/?type=${selectedType}&q=${searchQuery}`);
            setEntities(data);
        } catch (err) {
            console.error(err);
        } finally {
            if (!isSearch) setLoading(false);
        }
    };

    const handleSelectTree = (type) => {
        setSelectedType(type);
        setSelectedEntity(null);
        setIsEditing(false);
    };

    const handleSelectEntity = (entity) => {
        setSelectedEntity(entity);
        setIsEditing(true);
    };

    const handleNewEntity = () => {
        setSelectedEntity(null);
        setIsEditing(true);
    };

    const handleSave = (saved) => {
        fetchEntities();
        setSelectedEntity(saved);
        setIsEditing(false);
    };

    const handleImportSuccess = () => {
        fetchEntities();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
            <div style={{ padding: '16px 20px 8px 20px' }}>
                <ContentHeader 
                    title="Gestión de Entidades" 
                    breadcrumbs={[{ label: 'Configuración' }, { label: 'Entidades' }]}
                />
            </div>

            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', padding: '0 16px 16px 16px', gap: '12px' }}>
                {/* 1. LEFT PANE (Tree) */}
                <div style={{ 
                    width: '180px', 
                    background: 'white',
                    borderRadius: 'var(--r-md)',
                    boxShadow: 'var(--shadow-sm)',
                    border: '1px solid var(--border-color)',
                    overflowY: 'auto'
                }}>
                    <EntityTree onSelect={handleSelectTree} selectedId={selectedType} />
                </div>

                {/* 2. RIGHT PANE (Table + Editor) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: '12px' }}>
                    {/* TABLE AREA */}
                    <div style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        minHeight: 0,
                        background: 'white',
                        borderRadius: 'var(--r-md)',
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid var(--border-color)',
                        overflow: 'hidden'
                    }}>
                        <EntitiesTable 
                            entities={entities}
                            loading={loading}
                            selectedEntity={selectedEntity}
                            onSelect={handleSelectEntity}
                            onSearch={setSearchQuery}
                            searchQuery={searchQuery}
                            onNew={handleNewEntity}
                            onImport={() => setIsImporting(true)}
                            onImportSaldos={() => setIsImportingSaldos(true)}
                        />
                    </div>

                    {/* EDITOR AREA (Bottom Panel) */}
                    {isEditing && (
                        <div style={{ 
                            height: '50%', 
                            background: 'white',
                            borderRadius: 'var(--r-md)',
                            boxShadow: 'var(--shadow-lg)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 10,
                            overflow: 'hidden'
                        }}>
                                                        <EntityEditor 
                                entity={selectedEntity}
                                initialType={selectedType === 'mixed' ? 'client' : selectedType}
                                onSave={handleSave}
                                onCancel={() => setIsEditing(false)}
                                onSelectExisting={async (existing) => {
                                    if (existing.type) {
                                        setSelectedType(existing.type);
                                    }
                                    setSelectedEntity(existing);
                                    setIsEditing(true);
                                    fetchEntities(true);
                                }}
                            />
                        </div>
                    )}

                    {/* IMPORT MODAL/PANEL */}
                    {isImporting && (
                        <div style={{ 
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '600px',
                            minHeight: '400px',
                            maxHeight: '90vh',
                            background: 'white',
                            borderRadius: 'var(--r-md)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 100,
                            overflow: 'hidden'
                        }}>
                            <EntityImporter 
                                onImportSuccess={handleImportSuccess}
                                onCancel={() => setIsImporting(false)}
                            />
                        </div>
                    )}
                    {isImporting && (
                        <div 
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99 }}
                            onClick={() => setIsImporting(false)}
                        />
                    )}

                    {/* IMPORT SALDOS MODAL */}
                    {isImportingSaldos && (
                        <div style={{ 
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '640px',
                            minHeight: '400px',
                            maxHeight: '90vh',
                            background: 'white',
                            borderRadius: 'var(--r-md)',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 100,
                            overflow: 'hidden'
                        }}>
                            <LedgerImporter 
                                onImportSuccess={() => { setIsImportingSaldos(false); fetchEntities(); }}
                                onCancel={() => setIsImportingSaldos(false)}
                            />
                        </div>
                    )}
                    {isImportingSaldos && (
                        <div 
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 99 }}
                            onClick={() => setIsImportingSaldos(false)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
