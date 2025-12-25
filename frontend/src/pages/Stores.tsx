import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Plus, Search, Edit2, Trash2, X, MapPin, CheckCircle, AlertCircle, Map, List } from 'lucide-react';
import { storesApi, Store } from '../api/client';

// Configuração do mapa
const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

// Centro padrão (Brasil)
const defaultCenter = {
  lat: -6.0329,
  lng: -49.9137,
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
};

function useLeafletCdn(enabled: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }

    const w = window as any;
    if (w.L) {
      setReady(true);
      return;
    }

    const cssId = 'leaflet-css';
    const jsId = 'leaflet-js';

    const ensureCss = () => {
      if (document.getElementById(cssId)) return;
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    };

    const ensureJs = () => {
      if (document.getElementById(jsId)) return;
      const script = document.createElement('script');
      script.id = jsId;
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setReady(Boolean((window as any).L));
      script.onerror = () => setReady(false);
      document.body.appendChild(script);
    };

    ensureCss();
    ensureJs();

    const t = window.setInterval(() => {
      if ((window as any).L) {
        window.clearInterval(t);
        setReady(true);
      }
    }, 250);

    return () => window.clearInterval(t);
  }, [enabled]);

  return ready;
}

function LeafletOsmMap({
  stores,
  selectedStore,
  onSelectStore,
}: {
  stores: Store[];
  selectedStore: Store | null;
  onSelectStore: (s: Store | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const ready = useLeafletCdn(true);

  const storesWithCoords = useMemo(() => stores.filter((s) => Boolean(s.lat) && Boolean(s.lng)), [stores]);

  useEffect(() => {
    if (!ready) return;
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const L = (window as any).L;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const layer = L.featureGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    return () => {
      try {
        map.remove();
      } catch {}
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const L = (window as any).L;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const markers: any[] = [];
    for (const s of storesWithCoords) {
      const isSelected = Boolean(selectedStore && selectedStore.id === s.id);
      const isVerified = Boolean(s.verificado);
      const color = isSelected ? '#2563eb' : isVerified ? '#16a34a' : '#d97706';
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: isSelected ? 9 : 7,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      });
      marker.on('click', () => onSelectStore(s));
      marker.addTo(layer);
      markers.push(marker);
    }

    if (markers.length > 1) {
      const bounds = layer.getBounds();
      if (bounds && bounds.isValid && bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2));
      }
    } else if (markers.length === 1) {
      const s = storesWithCoords[0];
      map.setView([s.lat, s.lng], 14);
    } else {
      map.setView([defaultCenter.lat, defaultCenter.lng], 6);
    }
  }, [ready, onSelectStore, selectedStore, storesWithCoords]);

  return (
    <div className="relative h-full">
      {!ready ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
            <p>Carregando mapa...</p>
          </div>
        </div>
      ) : null}
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur rounded-lg shadow px-3 py-2 text-xs text-gray-700 flex items-center gap-2">
        <span className="font-medium">OpenStreetMap</span>
        <span className="text-gray-400">(fallback)</span>
      </div>

      {selectedStore && selectedStore.lat && selectedStore.lng ? (
        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur rounded-lg shadow p-3 text-xs w-[260px]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">
                {selectedStore.nome_fantasia || selectedStore.nome || '-'}
              </div>
              <div className="text-gray-600 mt-1 truncate">{selectedStore.endereco || ''}</div>
              <div className="text-gray-500 mt-1">
                {selectedStore.cidade}/{selectedStore.uf}
              </div>
            </div>
            <button className="text-gray-400 hover:text-gray-700" onClick={() => onSelectStore(null)}>
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <a
              href={`https://www.openstreetmap.org/?mlat=${selectedStore.lat}&mlon=${selectedStore.lng}#map=16/${selectedStore.lat}/${selectedStore.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-black"
            >
              Abrir
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.lat},${selectedStore.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
            >
              Rotas
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Stores() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'list' | 'map'>('split');

  const googleApiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const hasGoogleKey = Boolean(googleApiKey);

  // Carrega a API do Google Maps
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleApiKey,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['stores', page, search],
    queryFn: () => storesApi.list({ page, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => storesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
    },
  });

  const handleDelete = (store: Store) => {
    if (confirm(`Deseja remover a loja "${store.nome}"?`)) {
      deleteMutation.mutate(store.id);
    }
  };

  const handleEdit = (store: Store) => {
    setEditingStore(store);
    setShowModal(true);
  };

  const handleStoreClick = (store: Store) => {
    setSelectedStore(store);
  };

  // Filtra lojas com coordenadas válidas
  const storesWithLocation = data?.data.items.filter(
    (store) => store.lat && store.lng
  ) || [];

  // Calcula o centro do mapa baseado nas lojas
  const mapCenter = storesWithLocation.length > 0
    ? {
        lat: storesWithLocation.reduce((sum, s) => sum + (s.lat || 0), 0) / storesWithLocation.length,
        lng: storesWithLocation.reduce((sum, s) => sum + (s.lng || 0), 0) / storesWithLocation.length,
      }
    : defaultCenter;

  const onMapLoad = useCallback((map: google.maps.Map) => {
    if (storesWithLocation.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      storesWithLocation.forEach((store) => {
        if (store.lat && store.lng) {
          bounds.extend({ lat: store.lat, lng: store.lng });
        }
      });
      map.fitBounds(bounds);
    }
  }, [storesWithLocation]);

  return (
    <div className="h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lojas</h1>
          <p className="text-gray-500 mt-1">Gerencie os estabelecimentos cadastrados</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'split' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dividido
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                viewMode === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List size={16} />
              Lista
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                viewMode === 'map' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Map size={16} />
              Mapa
            </button>
          </div>
          <button
            onClick={() => {
              setEditingStore(null);
              setShowModal(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Nova Loja
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`grid gap-6 h-full ${
        viewMode === 'split' ? 'grid-cols-2' : 'grid-cols-1'
      }`}>
        
        {/* Lista de Lojas */}
        {(viewMode === 'split' || viewMode === 'list') && (
          <div className="flex flex-col h-full">
            {/* Search */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar por nome, CNPJ ou cidade..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Store List */}
            <div className="bg-white rounded-xl border border-gray-100 flex-1 overflow-hidden flex flex-col">
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Carregando...</div>
              ) : data?.data.items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nenhuma loja encontrada
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="divide-y divide-gray-100">
                    {data?.data.items.map((store) => (
                      <div
                        key={store.id}
                        className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedStore?.id === store.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                        }`}
                        onClick={() => handleStoreClick(store)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-gray-900 truncate">
                                {store.nome_fantasia || store.nome || '-'}
                              </h3>
                              {store.verificado ? (
                                <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                              ) : (
                                <AlertCircle size={14} className="text-yellow-500 flex-shrink-0" />
                              )}
                            </div>
                            {store.nome_fantasia && store.nome && (
                              <p className="text-xs text-gray-400 truncate">{store.nome}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                              {store.cidade && (
                                <span className="flex items-center gap-1">
                                  <MapPin size={12} />
                                  {store.cidade}/{store.uf}
                                </span>
                              )}
                              {store.lat && store.lng && (
                                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                  📍 Localizado
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(store);
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(store);
                              }}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pagination */}
              {data && data.data.pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-500">
                    Página {data.data.page} de {data.data.pages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm bg-white border rounded-lg disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= data.data.pages}
                      className="px-3 py-1 text-sm bg-white border rounded-lg disabled:opacity-50"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mapa */}
        {(viewMode === 'split' || viewMode === 'map') && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden h-full min-h-[400px]">
            {!hasGoogleKey ? (
              <LeafletOsmMap
                stores={data?.data.items || []}
                selectedStore={selectedStore}
                onSelectStore={setSelectedStore}
              />
            ) : !isLoaded ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                  <p>Carregando mapa...</p>
                </div>
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={mapCenter}
                zoom={12}
                options={mapOptions}
                onLoad={onMapLoad}
              >
                {storesWithLocation.map((store) => (
                  <Marker
                    key={store.id}
                    position={{ lat: store.lat!, lng: store.lng! }}
                    onClick={() => setSelectedStore(store)}
                    icon={{
                      url: selectedStore?.id === store.id
                        ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                        : store.verificado
                        ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
                        : 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
                    }}
                  />
                ))}

                {selectedStore && selectedStore.lat && selectedStore.lng && (
                  <InfoWindow
                    position={{ lat: selectedStore.lat, lng: selectedStore.lng }}
                    onCloseClick={() => setSelectedStore(null)}
                  >
                    <div className="p-2 min-w-[200px]">
                      <h3 className="font-semibold text-gray-900">
                        {selectedStore.nome_fantasia || selectedStore.nome}
                      </h3>
                      {selectedStore.endereco && (
                        <p className="text-sm text-gray-600 mt-1">{selectedStore.endereco}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        {selectedStore.cidade}/{selectedStore.uf}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleEdit(selectedStore)}
                          className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                        >
                          Editar
                        </button>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${selectedStore.lat},${selectedStore.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                        >
                          Rotas
                        </a>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            )}

            {/* Legenda */}
            {isLoaded && hasGoogleKey && (
              <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-xs">
                <p className="font-medium mb-2">Legenda</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                    <span>Verificada</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                    <span>Pendente</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                    <span>Selecionada</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <StoreModal
          store={editingStore}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function StoreModal({ store, onClose }: { store: Store | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    cnpj: store?.cnpj || '',
    nome: store?.nome || '',
    nome_fantasia: store?.nome_fantasia || '',
    endereco: store?.endereco || '',
    cidade: store?.cidade || '',
    uf: store?.uf || '',
    cep: store?.cep || '',
    telefone: store?.telefone || '',
    lat: store?.lat || null as number | null,
    lng: store?.lng || null as number | null,
    verificado: store?.verificado || false,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => storesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => storesApi.update(store!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (store) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {store ? 'Editar Loja' : 'Nova Loja'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ *</label>
            <input
              type="text"
              value={formData.cnpj}
              onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
              className="input"
              required
              disabled={!!store}
            />
          </div>
          
          <div className="bg-blue-50 p-3 rounded-lg space-y-3">
            <p className="text-xs text-blue-600 font-medium">Identificação</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Fantasia</label>
              <input
                type="text"
                value={formData.nome_fantasia}
                onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                className="input"
                placeholder="Nome popular do estabelecimento"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
              <input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="input"
                placeholder="Razão social (preenchido automaticamente)"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <input
              type="text"
              value={formData.endereco}
              onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
              className="input"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input
                type="text"
                value={formData.cidade}
                onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
              <input
                type="text"
                value={formData.uf}
                onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                className="input"
                maxLength={2}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
              <input
                type="text"
                value={formData.cep}
                onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                type="text"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                className="input"
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <div className="bg-green-50 p-3 rounded-lg space-y-3">
            <p className="text-xs text-green-600 font-medium">Geolocalização</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={formData.lat ?? ''}
                  onChange={(e) => setFormData({ ...formData, lat: e.target.value ? parseFloat(e.target.value) : null })}
                  className="input"
                  placeholder="-6.123456"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={formData.lng ?? ''}
                  onChange={(e) => setFormData({ ...formData, lng: e.target.value ? parseFloat(e.target.value) : null })}
                  className="input"
                  placeholder="-49.123456"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Dica: Busque o endereço no Google Maps, clique com botão direito e copie as coordenadas
            </p>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="verificado"
              checked={formData.verificado}
              onChange={(e) => setFormData({ ...formData, verificado: e.target.checked })}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <label htmlFor="verificado" className="text-sm text-gray-700">
              <span className="font-medium">Dados verificados</span>
              <span className="block text-xs text-gray-500">Marque após revisar e confirmar os dados</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
