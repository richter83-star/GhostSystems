export function choosePrice(b:number){ const t=[0.8,1.0,1.3]; const p=t[Math.floor(Math.random()*t.length)]; return Math.round(b*p); }
