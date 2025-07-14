import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'https://trip-settlement.onrender.com/api';

function App() {
    // State declarations
    const [participants, setParticipants] = useState([]);
    const [newParticipant, setNewParticipant] = useState('');
    const [expenses, setExpenses] = useState([]);
    const [pendingExpenses, setPendingExpenses] = useState([]);
    const [settlement, setSettlement] = useState(null);
    const [newItem, setNewItem] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [newPayer, setNewPayer] = useState('');
    const [newShares, setNewShares] = useState({});

    // Fetch initial participants
    useEffect(() => {
        fetch(`${API_URL}/participants`)
            .then(res => res.json())
            .then(data => setParticipants(data))
            .catch(err => console.error("Failed to fetch participants:", err));
    }, []);

    // Fetch expenses whenever participants change
    useEffect(() => {
        fetchExpenses();
    }, [participants]);

    // Update default payer and shares when participants change
    useEffect(() => {
        if (participants.length > 0) {
            if (!newPayer || !participants.includes(newPayer)) {
                setNewPayer(participants[0]);
            }
            const initialShares = participants.reduce((acc, p) => ({ ...acc, [p]: 1 }), {});
            setNewShares(initialShares);
        }
    }, [participants, newPayer]);

    const fetchExpenses = () => {
        fetch(`${API_URL}/expenses`).then(res => res.json()).then(data => setExpenses(data)).catch(err => console.error("Failed to fetch expenses:", err));
        fetch(`${API_URL}/expenses/pending`).then(res => res.json()).then(data => setPendingExpenses(data)).catch(err => console.error("Failed to fetch pending expenses:", err));
    };

    const handleAddParticipant = () => {
        if (newParticipant && !participants.includes(newParticipant)) {
            const updatedParticipants = [...participants, newParticipant];
            fetch(`${API_URL}/participants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participants: updatedParticipants })
            })
            .then(res => res.json())
            .then(data => setParticipants(data));
            setNewParticipant('');
        }
    };

    const handleAddExpense = () => {
        const expenseData = {
            item: newItem,
            amount: parseFloat(newAmount),
            currency: 'KRW', // Simplified
            exchangeRate: 1,
            amountKRW: parseFloat(newAmount),
            payer: newPayer,
            shares: newShares
        };

        fetch(`${API_URL}/expenses/pending`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        }).then(() => {
            fetchExpenses();
            setNewItem('');
            setNewAmount('');
        });
    };

    const handleApprove = (id) => {
        fetch(`${API_URL}/expenses/approve/${id}`, { method: 'POST' })
            .then(() => fetchExpenses());
    };

    const handleReject = (id) => {
        fetch(`${API_URL}/expenses/reject/${id}`, { method: 'DELETE' })
            .then(() => fetchExpenses());
    };

    const handleSettlement = () => {
        fetch(`${API_URL}/settlement`)
            .then(res => res.json())
            .then(data => setSettlement(data));
    };

    return (
        <div className="App">
            <h1>여행 경비 정산</h1>
            <div className="container">
                <h2>참가자 설정</h2>
                <div className="participant-input">
                    <input 
                        type="text" 
                        value={newParticipant}
                        onChange={(e) => setNewParticipant(e.target.value)}
                        placeholder="참가자 이름 입력"
                    />
                    <button onClick={handleAddParticipant}>추가</button>
                </div>
                <div className="participants">
                    {participants.map(p => <span key={p} className="participant">{p}</span>)}
                </div>
            </div>

            {participants.length > 0 && (
                <>
                    <div className="container">
                        <h2>비용 추가</h2>
                        <div className="expense-form">
                            <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="항목" />
                            <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="금액 (KRW)" />
                            <select value={newPayer} onChange={e => setNewPayer(e.target.value)}>
                                {participants.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <button onClick={handleAddExpense}>제출 (승인 대기)</button>
                        </div>
                    </div>

                    <div className="container">
                        <h2>승인 대기중인 항목</h2>
                        {pendingExpenses.map(e => (
                            <div key={e.id} className="expense-item pending">
                                <span>{e.item}: {e.amountKRW.toLocaleString()}원 (결제: {e.payer})</span>
                                <div>
                                    <button className="approve" onClick={() => handleApprove(e.id)}>승인</button>
                                    <button className="reject" onClick={() => handleReject(e.id)}>거절</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="container">
                        <h2>정산 현황</h2>
                        <button onClick={handleSettlement} className="settle-button">정산 결과 보기</button>
                        <h3>확정된 비용</h3>
                        {expenses.map(e => (
                            <div key={e.id} className="expense-item">
                                <span>{e.item}: {e.amountKRW.toLocaleString()}원 (결제: {e.payer})</span>
                            </div>
                        ))}
                        {settlement && (
                            <div className="settlement-result">
                                <h3>최종 정산 결과</h3>
                                <p>총 지출: {settlement.totalSpent.toLocaleString()}원</p>
                                <h4>개인별 정산</h4>
                                <ul>
                                    {Object.entries(settlement.balances).map(([person, balance]) => (
                                        <li key={person}>{person}: {balance > 0 ? `${Math.round(balance).toLocaleString()}원 받을 예정` : `${Math.round(Math.abs(balance)).toLocaleString()}원 보낼 예정`}</li>
                                    ))}
                                </ul>
                                <h4>송금 목록</h4>
                                <table>
                                    <thead>
                                        <tr><th>보내는 사람</th><th>받는 사람</th><th>금액</th></tr>
                                    </thead>
                                    <tbody>
                                        {settlement.transactions.map((t, i) => (
                                            <tr key={i}><td>{t.from}</td><td>{t.to}</td><td>{Math.round(t.amount).toLocaleString()}원</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default App;
