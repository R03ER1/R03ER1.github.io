// ---------- Firebase inicializace ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Stejná konfigurace jako v hlavní aplikaci
const firebaseConfig = {
  apiKey: "AIzaSyAqYa5Lcl3KL5XvRGRBkAclnHj_XdIh3sI",
  authDomain: "maturak-rezervace-84e9c.firebaseapp.com",
  projectId: "maturak-rezervace-84e9c",
  storageBucket: "maturak-rezervace-84e9c.firebasestorage.app",
  messagingSenderId: "69611879820",
  appId: "1:69611879820:web:6e85e3281768a8bf846aa9",
  measurementId: "G-YFBBJXHJ8E",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const reservationsCol = collection(db, "reservations");
const paymentsCol = collection(db, "payments");

function getAdminPassword() {
  const parts = ["TWlu", "ZHph", "Njc="];
  return atob(parts.join(""));
}

document.addEventListener("DOMContentLoaded", () => {
  const passwordSection = document.getElementById("password-section");
  const paymentsSection = document.getElementById("payments-section");
  const passwordInput = document.getElementById("payments-password");
  const passwordMessage = document.getElementById("password-message");
  const loginBtn = document.getElementById("payments-login");
  const tableBody = document.getElementById("payments-table-body");
  const paymentsMessage = document.getElementById("payments-message");

  loginBtn.addEventListener("click", async () => {
    passwordMessage.textContent = "";
    passwordMessage.className = "form-message";

    if (passwordInput.value !== getAdminPassword()) {
      passwordMessage.textContent = "Nesprávné heslo.";
      passwordMessage.classList.add("error");
      return;
    }

    passwordSection.classList.add("hidden");
    paymentsSection.classList.remove("hidden");
    await loadData();
  });

  async function loadData() {
    paymentsMessage.textContent = "Načítám data...";
    paymentsMessage.className = "form-message";

    try {
      const reservationsSnapshot = await getDocs(reservationsCol);
      const reservations = reservationsSnapshot.docs.map((d) => d.data());

      const amountsByName = new Map();

      reservations.forEach((r) => {
        const name = (r.name || "").trim();
        if (!name) return;

        // Stání se do ceny nezapočítává
        if (r.roomId === "Stání") {
          return;
        }

        const pricePerSeat = r.roomId === "room1" ? 450 : 420;

        if (!amountsByName.has(name)) {
          amountsByName.set(name, {
            totalDue: 0,
          });
        }

        const stats = amountsByName.get(name);
        stats.totalDue += pricePerSeat;
      });

      // Načteme všechny dosavadní platby
      const paymentsSnapshot = await getDocs(paymentsCol);
      const paymentsByName = new Map();
      paymentsSnapshot.docs.forEach((d) => {
        const data = d.data();
        const name = (data.name || d.id || "").trim();
        if (!name) return;
        paymentsByName.set(name, {
          totalPaid: Number(data.totalPaid) || 0,
        });
      });

      renderTable(amountsByName, paymentsByName);
      paymentsMessage.textContent = "";
    } catch (e) {
      console.error(e);
      paymentsMessage.textContent = "Nepodařilo se načíst data.";
      paymentsMessage.classList.add("error");
    }
  }

  function renderTable(amountsByName, paymentsByName) {
    tableBody.innerHTML = "";

    const names = Array.from(amountsByName.keys()).sort((a, b) =>
      a.localeCompare(b, "cs", { sensitivity: "base" })
    );

    names.forEach((name) => {
      const due = amountsByName.get(name)?.totalDue || 0;
      const paid = paymentsByName.get(name)?.totalPaid || 0;
      const remaining = due - paid;

      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = name;
      tdName.style.padding = "4px 6px";

      const tdDue = document.createElement("td");
      tdDue.textContent = `${due} Kč`;
      tdDue.style.padding = "4px 6px";
      tdDue.style.textAlign = "right";

      const tdPaid = document.createElement("td");
      tdPaid.textContent = `${paid} Kč`;
      tdPaid.style.padding = "4px 6px";
      tdPaid.style.textAlign = "right";

      const tdRemaining = document.createElement("td");
      tdRemaining.textContent = `${remaining} Kč`;
      tdRemaining.style.padding = "4px 6px";
      tdRemaining.style.textAlign = "right";
      if (remaining > 0) {
        tdRemaining.style.color = "#b91c1c"; // dluží
      } else if (remaining < 0) {
        tdRemaining.style.color = "#0f766e"; // přeplaceno
      }

      const tdInput = document.createElement("td");
      tdInput.style.padding = "4px 6px";
      tdInput.style.textAlign = "right";
      const input = document.createElement("input");
      input.type = "number";
      input.step = "10";
      input.value = due.toString();
      input.style.width = "100px";
      tdInput.appendChild(input);

      const tdAction = document.createElement("td");
      tdAction.style.padding = "4px 6px";
      const btn = document.createElement("button");
      btn.textContent = "Zaplatit";
      btn.className = "btn secondary";
      btn.style.padding = "4px 10px";
      btn.style.fontSize = "0.75rem";
      btn.addEventListener("click", async () => {
        const rawValue = input.value.trim();
        const amount = Number(rawValue.replace(",", "."));

        if (!rawValue || Number.isNaN(amount) || amount === 0) {
          alert("Zadejte prosím nenulovou částku (může být i záporná pro vrácení peněz).");
          return;
        }

        await applyPayment(name, amount);
      });
      tdAction.appendChild(btn);

      tr.appendChild(tdName);
      tr.appendChild(tdDue);
      tr.appendChild(tdPaid);
      tr.appendChild(tdRemaining);
      tr.appendChild(tdInput);
      tr.appendChild(tdAction);

      tableBody.appendChild(tr);
    });
  }

  async function applyPayment(name, amount) {
    paymentsMessage.textContent = "Ukládám platbu...";
    paymentsMessage.className = "form-message";

    try {
      const docRef = doc(paymentsCol, name);
      const existingSnap = await getDoc(docRef);
      const existing = existingSnap.exists()
        ? existingSnap.data()
        : { name, totalPaid: 0 };

      const newTotalPaid = (Number(existing.totalPaid) || 0) + amount;

      await setDoc(docRef, { name, totalPaid: newTotalPaid }, { merge: true });
      await loadData();

      paymentsMessage.textContent = "Platba byla uložena.";
      paymentsMessage.classList.add("success");
    } catch (e) {
      console.error(e);
      paymentsMessage.textContent = "Nepodařilo se uložit platbu.";
      paymentsMessage.classList.add("error");
    }
  }
}
);

