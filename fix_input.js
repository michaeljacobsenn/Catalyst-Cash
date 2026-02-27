const fs = require('fs');
let code = fs.readFileSync('src/modules/tabs/InputForm.jsx', 'utf8');

const regex = /const today = new Date\(\);[\s\S]*?checking: "", ally: "",[\s\S]*?roth: financialConfig\?\.investmentRoth \|\| "",[\s\S]*?autoPaycheckAdd: false, paycheckAddOverride: ""\s+\}\);/;

code = code.replace(regex, `const today = new Date();
    const [form, setForm] = useState({
        date: today.toISOString().split("T")[0], time: today.toTimeString().split(" ")[0].slice(0, 5),
        checking: "", ally: "",
        roth: financialConfig?.investmentRoth || "",
        brokerage: financialConfig?.investmentBrokerage || "",
        k401Balance: financialConfig?.k401Balance || "",
        pending: "0.00", pendingConfirmed: true,
        habitCount: 10, debts: [{ cardId: "", name: "", balance: "" }], notes: "",
        autoPaycheckAdd: false, paycheckAddOverride: ""
    });`);

fs.writeFileSync('src/modules/tabs/InputForm.jsx', code);
console.log("Fixed InputForm.jsx");
