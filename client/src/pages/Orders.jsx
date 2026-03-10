import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import OrderCard from '../components/OrderCard';
import api from '../api';

export default function Orders({ onOrderAction }) {
    const { user } = useAuth();
    const toast = useToast();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadOrders(); }, []);

    async function loadOrders() {
        try {
            setLoading(true);
            const data = await api.getOrders();
            setOrders(Array.isArray(data) ? data : []);
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    function handleAction(action, orderId) {
        if (onOrderAction) onOrderAction(action, orderId, loadOrders);
    }
    
    // Prioritize active orders first, then sort by newest
    const displayOrders = [...orders].sort((a, b) => {
        const aActive = !['SETTLED', 'RESOLVED', 'DELETED'].includes(a.status);
        const bActive = !['SETTLED', 'RESOLVED', 'DELETED'].includes(b.status);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return (
        <div className="fade-in">
            <div className="section">
                <div className="section-header">
                    <h2>📦 All Orders</h2>
                    {user?.role === 'customer' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleAction('newOrder')}>+ New Order</button>
                    )}
                </div>
                {loading ? (
                    <div><div className="spinner" /><p className="loading-text">Loading orders...</p></div>
                ) : orders.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <h3>No Orders Yet</h3>
                        <p>{user?.role === 'customer' ? 'Create your first order to get started!' : 'No orders assigned to you yet.'}</p>
                    </div>
                ) : (
                    <div className="orders-grid">
                        {displayOrders.map(order => (
                            <OrderCard key={order.orderId} order={order} onAction={handleAction} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
