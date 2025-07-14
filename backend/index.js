const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, 'db.json');

const ADMIN_PASSWORD = '0865'; // 관리자 비밀번호 (보안에 취약하니 실제 서비스에서는 환경 변수 사용 권장)

const readDb = () => {
    try {
        const dbData = fs.readFileSync(dbPath);
        const data = JSON.parse(dbData);
        // Ensure all top-level properties exist
        data.participants = data.participants || [];
        data.expenses = data.expenses || [];
        data.pendingExpenses = data.pendingExpenses || [];
        return data;
    } catch (error) {
        console.error("Error reading or parsing db.json:", error);
        // If file doesn't exist or is invalid, return initial structure
        return {
            participants: [],
            expenses: [],
            pendingExpenses: []
        };
    }
};

const writeDb = (data) => {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

// Initialize db.json if it doesn't exist or is empty/invalid
// This block is moved to ensure it runs before any route handlers try to read the DB
try {
    const dbData = fs.readFileSync(dbPath);
    const data = JSON.parse(dbData);
    // Ensure all top-level properties exist
    data.participants = data.participants || [];
    data.expenses = data.expenses || [];
    data.pendingExpenses = data.pendingExpenses || [];
    writeDb(data); // Write back to ensure any missing properties are added
} catch (error) {
    console.error("db.json initialization error:", error);
    // If file doesn't exist or is invalid, create initial structure
    writeDb({
        participants: [],
        expenses: [],
        pendingExpenses: []
    });
    console.log("db.json initialized with default structure.");
}

// 관리자 권한 확인 미들웨어
const checkAdmin = (req, res, next) => {
    const adminPassword = req.headers['x-admin-password'];
    if (adminPassword === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(403).send('관리자 권한이 없습니다.');
    }
};

// 참가자 설정 (관리자 전용)
app.post('/api/participants', checkAdmin, (req, res) => {
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

// 참가자 삭제 (관리자 전용)
app.delete('/api/participants/:name', checkAdmin, (req, res) => {
    const { name } = req.params;
    const db = readDb();
    const initialLength = db.participants.length;
    db.participants = db.participants.filter(p => p !== name);

    // 삭제된 참가자의 비용 부담 비중을 0으로 설정
    db.expenses.forEach(expense => {
        if (expense.shares[name] !== undefined) {
            expense.shares[name] = 0;
        }
    });
    db.pendingExpenses.forEach(expense => {
        if (expense.shares[name] !== undefined) {
            expense.shares[name] = 0;
        }
    });

    writeDb(db);
    if (db.participants.length === initialLength) {
        return res.status(404).send('Participant not found');
    }
    res.status(204).send();
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

app.get('/api/expenses/pending', (req, res) => {
    const db = readDb();
    res.status(200).send(db.pendingExpenses);
});

app.get('/api/expenses', (req, res) => {
    const db = readDb();
    res.status(200).send(db.expenses);
});

// 관리자 승인 (관리자 전용)
app.post('/api/expenses/approve/:id', checkAdmin, (req, res) => {
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

// 관리자 거절 (관리자 전용)
app.delete('/api/expenses/reject/:id', checkAdmin, (req, res) => {
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

// 비용 부담 비중 수정 (관리자 전용)
app.put('/api/expenses/:id/shares', checkAdmin, (req, res) => {
    const { id } = req.params;
    const { shares } = req.body;
    console.log(`Updating shares for expense ${id}:`, shares); // 디버깅 로그 추가
    const db = readDb();
    const expenseIndex = db.expenses.findIndex(e => e.id === parseInt(id));

    if (expenseIndex === -1) {
        return res.status(404).send('Expense not found');
    }
    if (!shares || typeof shares !== 'object') {
        return res.status(400).send('Invalid shares data');
    }

    db.expenses[expenseIndex].shares = shares;
    writeDb(db);
    res.status(200).send(db.expenses[expenseIndex]);
});

// 비용 삭제 (관리자 전용)
app.delete('/api/expenses/:id', checkAdmin, (req, res) => {
    const { id } = req.params;
    const db = readDb();
    const initialLength = db.expenses.length;
    db.expenses = db.expenses.filter(e => e.id !== parseInt(id));
    if (db.expenses.length === initialLength) {
        return res.status(404).send('Expense not found');
    }
    writeDb(db);
    res.status(204).send();
});

// 모든 데이터 초기화 (관리자 전용)
app.post('/api/reset', checkAdmin, (req, res) => {
    writeDb({
        participants: [],
        expenses: [],
        pendingExpenses: []
    });
    res.status(200).send('All data reset successfully.');
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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log("Backend server started successfully."); // Added log
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