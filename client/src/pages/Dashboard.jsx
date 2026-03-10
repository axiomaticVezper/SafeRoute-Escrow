import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import OrderCard from '../components/OrderCard';
import api from '../api';

export default function Dashboard({ onOrderAction }) {
    const { user } = useAuth();
    const toast = useToast();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
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

    const total = orders.length;
    const activeOrdersList = orders.filter(o => !['SETTLED', 'RESOLVED', 'DELETED'].includes(o.status));
    const active = activeOrdersList.length;
    const completed = orders.filter(o => ['SETTLED', 'RESOLVED'].includes(o.status)).length;
    const disputed = orders.filter(o => o.status === 'DISPUTED').length;
    const totalValue = orders.reduce((s, o) => s + (o.amount || 0), 0);
    const inTransit = orders.filter(o => o.status === 'IN_TRANSIT').length;
    const proofPending = orders.filter(o => o.status === 'PROOF_SUBMITTED').length;

    const statsMap = {
        customer: [
            { icon: '📦', cls: 'indigo', value: total, label: 'Total Orders' },
            { icon: '⏳', cls: 'amber', value: active, label: 'Active' },
            { icon: '✅', cls: 'emerald', value: completed, label: 'Completed' },
            { icon: '💰', cls: 'cyan', value: `₹${totalValue.toLocaleString()}`, label: 'Total Value' },
        ],
        driver: [
            { icon: '🚚', cls: 'indigo', value: total, label: 'Assigned' },
            { icon: '📍', cls: 'amber', value: inTransit, label: 'In Transit' },
            { icon: '✅', cls: 'emerald', value: completed, label: 'Completed' },
            { icon: '📸', cls: 'cyan', value: proofPending, label: 'Proof Pending' },
        ],
        admin: [
            { icon: '📊', cls: 'indigo', value: total, label: 'Total Orders' },
            { icon: '⚠️', cls: 'rose', value: disputed, label: 'Disputes' },
            { icon: '✅', cls: 'emerald', value: completed, label: 'Resolved/Settled' },
            { icon: '💰', cls: 'cyan', value: `₹${totalValue.toLocaleString()}`, label: 'Total Value' },
        ],
        supplier: [
            { icon: '📦', cls: 'indigo', value: total, label: 'Orders' },
            { icon: '⏳', cls: 'amber', value: active, label: 'Pending' },
            { icon: '✅', cls: 'emerald', value: completed, label: 'Completed' },
            { icon: '💰', cls: 'cyan', value: `₹${totalValue.toLocaleString()}`, label: 'Earnings' },
        ],
    };

    const stats = statsMap[user?.role] || statsMap.customer;

    function handleAction(action, orderId) {
        if (onOrderAction) onOrderAction(action, orderId, loadData);
    }
    
    // Prioritize active orders first, then sort by newest
    const displayOrders = [...orders].sort((a, b) => {
        const aActive = !['SETTLED', 'RESOLVED', 'DELETED'].includes(a.status);
        const bActive = !['SETTLED', 'RESOLVED', 'DELETED'].includes(b.status);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
    }).slice(0, 6);

    return (
        <div className="fade-in">
            <div className="stats-grid">
                {stats.map((s, i) => (
                    <div className="stat-card slide-up" key={i} style={{ animationDelay: `${i * 80}ms` }}>
                        <div className={`stat-icon ${s.cls}`}>{s.icon}</div>
                        <div className="stat-value">{s.value}</div>
                        <div className="stat-label">{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="section">
                <div className="section-header">
                    <h2>📋 Recent Orders</h2>
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
