const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, 'db.json');

const readDb = () => {
    const dbData = fs.readFileSync(dbPath);
    return JSON.parse(dbData);
};

const writeDb = (data) => {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

// 참가자 설정
app.post('/api/participants', (req, res) => {
    const { participants } = req.body;
    if (!participants || !Array.isArray(participants)) {
        return res.status(400).send('Invalid participants data');
    }
    const db = readDb();
    db.participants = participants;
    writeDb(db);
    res.status(201).send(db.participants);
});

app.get('/api/participants', (req, res) => {
    const db = readDb();
    res.status(200).send(db.participants);
});

app.get('/api/expenses/pending', (req, res) => {
    const db = readDb();
    res.status(200).send(db.pendingExpenses);
});

app.get('/api/expenses', (req, res) => {
    const db = readDb();
    res.status(200).send(db.expenses);
});

// 비용 제출 (승인 대기)
app.post('/api/expenses/pending', (req, res) => {
    const { item, amount, currency, exchangeRate, amountKRW, payer, shares } = req.body;
    const db = readDb();
    const newPendingExpense = {
        id: Date.now(),
        item,
        amount,
        currency,
        exchangeRate,
        amountKRW,
        payer,
        shares
    };
    db.pendingExpenses.push(newPendingExpense);
    writeDb(db);
    res.status(201).send(newPendingExpense);
});

// 관리자 승인
app.post('/api/expenses/approve/:id', (req, res) => {
    const { id } = req.params;
    const db = readDb();
    const expenseToApprove = db.pendingExpenses.find(e => e.id === parseInt(id));
    if (!expenseToApprove) {
        return res.status(404).send('Pending expense not found');
    }

    db.pendingExpenses = db.pendingExpenses.filter(e => e.id !== parseInt(id));
    db.expenses.push(expenseToApprove);
    writeDb(db);
    res.status(200).send(expenseToApprove);
});

// 관리자 거절
app.delete('/api/expenses/reject/:id', (req, res) => {
    const { id } = req.params;
    const db = readDb();
    const initialLength = db.pendingExpenses.length;
    db.pendingExpenses = db.pendingExpenses.filter(e => e.id !== parseInt(id));
    if (db.pendingExpenses.length === initialLength) {
        return res.status(404).send('Pending expense not found');
    }
    writeDb(db);
    res.status(204).send();
});

// 정산 결과 계산
app.get('/api/settlement', (req, res) => {
    const db = readDb();
    const { participants, expenses } = db;
    if (participants.length === 0) {
        return res.status(200).send({ balances: {}, transactions: [], totalSpent: 0 });
    }

    const totalSpent = expenses.reduce((acc, e) => acc + e.amountKRW, 0);
    let balances = participants.reduce((acc, p) => ({ ...acc, [p]: 0 }), {});

    expenses.forEach(expense => {
        balances[expense.payer] += expense.amountKRW;
        const totalShares = Object.values(expense.shares).reduce((acc, val) => acc + val, 0);
        if (totalShares > 0) {
            for (const participant in expense.shares) {
                const share = expense.shares[participant];
                const cost = (expense.amountKRW * share) / totalShares;
                balances[participant] -= cost;
            }
        }
    });

    const debtors = [];
    const creditors = [];

    for (const person in balances) {
        if (balances[person] > 0) {
            creditors.push({ person, amount: balances[person] });
        } else if (balances[person] < 0) {
            debtors.push({ person, amount: -balances[person] });
        }
    }

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const transactions = [];
    let i = 0, j = 0;
    while (i < creditors.length && j < debtors.length) {
        const creditor = creditors[i];
        const debtor = debtors[j];
        const amount = Math.min(creditor.amount, debtor.amount);

        transactions.push({ from: debtor.person, to: creditor.person, amount });

        creditor.amount -= amount;
        debtor.amount -= amount;

        if (creditor.amount === 0) i++;
        if (debtor.amount === 0) j++;
    }

    res.status(200).send({ balances, transactions, totalSpent });
});

app.get('/', (req, res) => {
    res.send('Trip Settlement Backend is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});