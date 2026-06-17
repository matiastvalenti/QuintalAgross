import { API_URL } from '../config';

const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const api = {
    get: async (url, options = {}) => {
        const urlWithBase = url.startsWith('http') ? url : `${API_URL}${url}`;
        const urlObj = new URL(urlWithBase);

        // Inject stored cost_center if not provided, AND if it's not 0 (Combined)
        const storedCC = localStorage.getItem('costCenter') || '1';
        if (storedCC !== '0') {
            if (!urlObj.searchParams.has('cost_center') && options.params?.cost_center === undefined) {
                 urlObj.searchParams.set('cost_center', storedCC);
            }
        }

        // Add explicit params from options
        if (options.params) {
            for (const [key, value] of Object.entries(options.params)) {
                if (value !== undefined && value !== null) {
                    // Only set if not 0, or if it's an explicit param we want to keep
                    if (key === 'cost_center' && value === 0) continue;
                    urlObj.searchParams.set(key, value);
                }
            }
        }


        const res = await fetch(urlObj.toString(), {
            ...options,
            headers: {
                ...getAuthHeaders(),
                ...options.headers
            }
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data;
    },
    post: async (url, body, options = {}) => {
        const storedCC = localStorage.getItem('costCenter') || '1';
        let parsedBody = body;
        if (body && typeof body === 'object' && !(body instanceof FormData)) {
           if (!('cost_center' in body) && storedCC !== '0') {
               parsedBody = { ...body, cost_center: parseInt(storedCC, 10) };
           }
        }
        
        const urlWithBase = url.startsWith('http') ? url : `${API_URL}${url}`;
        const urlObj = new URL(urlWithBase);
        
        const res = await fetch(urlObj.toString(), {
            ...options,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
                ...options.headers
            },
            body: body instanceof FormData ? body : JSON.stringify(parsedBody)
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data;
    },
    put: async (url, body, options = {}) => {
        const storedCC = localStorage.getItem('costCenter') || '1';
        let parsedBody = body;
        if (body && typeof body === 'object' && !(body instanceof FormData)) {
           if (!('cost_center' in body) && storedCC !== '0') {
               parsedBody = { ...body, cost_center: parseInt(storedCC, 10) };
           }
        }

        
        const urlWithBase = url.startsWith('http') ? url : `${API_URL}${url}`;
        const urlObj = new URL(urlWithBase);

        const res = await fetch(urlObj.toString(), {
            ...options,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
                ...options.headers
            },
            body: body instanceof FormData ? body : JSON.stringify(parsedBody)
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data;
    },
    delete: async (url, options = {}) => {
        const res = await fetch(`${API_URL}${url}`, {
            ...options,
            method: 'DELETE',
            headers: {
                ...getAuthHeaders(),
                ...options.headers
            }
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data;
    }
};

export default api;
