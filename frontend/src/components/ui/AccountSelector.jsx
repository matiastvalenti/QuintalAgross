import React, { useState, useEffect } from 'react';
import Select from './Select';
import { API_URL } from '../../config';

export default function AccountSelector({ label, value, onChange, placeholder = "Seleccionar cuenta...", ...rest }) {
    const [accounts, setAccounts] = useState([]);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const res = await fetch(`${API_URL}/accounting/accounts-ledger/`);
                if (res.ok) {
                    const data = await res.json();
                    setAccounts(data);
                }
            } catch (e) {
                console.error("Error fetching accounts", e);
            }
        };
        fetchAccounts();
    }, []);

    return (
        <Select label={label} value={value} onChange={onChange} {...rest}>
            <option value="">{placeholder}</option>
            {accounts.map(a => (
                <option key={a.id} value={a.code}>
                    {a.code} - {a.name}
                </option>
            ))}
        </Select>
    );
}
