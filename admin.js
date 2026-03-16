// ---------- Firebase inicializace ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
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

// Stejná konfigurace stolů jako v hlavní aplikaci
const ROOM1_TABLE_SEATS = {
  1: 10,  2: 10,  3: 6,  4: 6,  5: 8, 6: 8,
  7: 8,  8: 8, 9: 6, 10: 6, 11: 6, 12: 6,
  13: 6, 14: 6, 15: 9, 16: 10, 17: 10, 18: 10,
  19: 10, 20: 7, 21: 8, 22: 5,
  23: 8, 24: 8, 25: 8, 26: 8, 27: 8, 28: 8,
  29: 8, 30: 8, 31: 8, 32: 8, 33: 8, 34: 8,
  35: 8, 36: 8, 37: 8,
};

const ROOM2_TABLE_SEATS = {
  1: 10, 2: 10, 3: 10, 4: 10, 5: 10,
  6: 10,  7: 10,  8: 10,
  9: 12, 10: 12, 11: 8, 12: 8, 13: 8,
};

const ROOMS = {
  room1: {
    id: "room1",
    name: "Hlavní sál (modrý)",
    tables: Array.from({ length: 37 }, (_, i) => {
      const number = i + 1;
      return {
        id: `room1-${number}`,
        number,
        seatCount: ROOM1_TABLE_SEATS[number] ?? 10,
      };
    }),
  },
  room2: {
    id: "room2",
    name: "Malý sál (žlutý)",
    tables: Array.from({ length: 13 }, (_, i) => {
      const number = i + 1;
      return {
        id: `room2-${number}`,
        number,
        seatCount: ROOM2_TABLE_SEATS[number] ?? 10,
      };
    }),
  },
};

const PASSWORD = "Mindza67";

document.addEventListener("DOMContentLoaded", () => {
  const passwordSection = document.getElementById("password-section");
  const adminSection = document.getElementById("admin-section");
  const passwordInput = document.getElementById("admin-password");
  const passwordMessage = document.getElementById("password-message");
  const loginBtn = document.getElementById("admin-login");
  const clearAllBtn = document.getElementById("clear-all");
  const tableBody = document.getElementById("admin-table-body");
  const adminMessage = document.getElementById("admin-message");

  let reservations = []; // {id, data}

  loginBtn.addEventListener("click", async () => {
    passwordMessage.textContent = "";
    passwordMessage.className = "form-message";

    if (passwordInput.value !== PASSWORD) {
      passwordMessage.textContent = "Nesprávné heslo.";
      passwordMessage.classList.add("error");
      return;
    }

    passwordSection.classList.add("hidden");
    adminSection.classList.remove("hidden");
    await loadData();
  });

  async function loadData() {
    adminMessage.textContent = "Načítám data...";
    adminMessage.className = "form-message";
    try {
      const snapshot = await getDocs(reservationsCol);
      reservations = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      renderTable();
      adminMessage.textContent = "";
    } catch (e) {
      console.error(e);
      adminMessage.textContent = "Nepodařilo se načíst data.";
      adminMessage.classList.add("error");
    }
  }

  function renderTable() {
    tableBody.innerHTML = "";

    const allRows = [];

    Object.values(ROOMS).forEach((room) => {
      room.tables.forEach((table) => {
        for (let seat = 1; seat <= table.seatCount; seat++) {
          const res = reservations.find(
            (r) =>
              r.roomId === room.id &&
              r.tableId === table.id &&
              r.seatNumber === seat
          );

          const tr = document.createElement("tr");
          tr.style.background = res ? "#fef2f2" : "#ecfdf3";

          const tdRoom = document.createElement("td");
          tdRoom.textContent = room.name;
          tdRoom.style.padding = "4px 6px";

          const tdTable = document.createElement("td");
          tdTable.textContent = table.number;
          tdTable.style.padding = "4px 6px";

          const tdSeat = document.createElement("td");
          tdSeat.textContent = seat;
          tdSeat.style.padding = "4px 6px";

          const tdStatus = document.createElement("td");
          tdStatus.style.padding = "4px 6px";
          tdStatus.textContent = res ? `Obsazeno – ${res.name}` : "Volné";

          const tdAction = document.createElement("td");
          tdAction.style.padding = "4px 6px";

          if (res) {
            const btn = document.createElement("button");
            btn.textContent = "Zrušit";
            btn.className = "btn secondary";
            btn.style.padding = "4px 10px";
            btn.style.fontSize = "0.75rem";
            btn.addEventListener("click", async () => {
              if (!confirm(`Opravdu zrušit rezervaci místa ${seat} u stolu ${table.number}?`)) {
                return;
              }
              await deleteReservation(res.id);
            });
            tdAction.appendChild(btn);
          } else {
            tdAction.textContent = "-";
          }

          tr.appendChild(tdRoom);
          tr.appendChild(tdTable);
          tr.appendChild(tdSeat);
          tr.appendChild(tdStatus);
          tr.appendChild(tdAction);

          allRows.push(tr);
        }
      });
    });

    // seřazení: nejdřív room1, pak room2, v rámci podle čísla stolu a místa
    allRows.forEach((row) => tableBody.appendChild(row));
  }

  async function deleteReservation(id) {
    adminMessage.textContent = "Mažu rezervaci...";
    adminMessage.className = "form-message";
    try {
      await deleteDoc(doc(db, "reservations", id));
      await loadData();
      adminMessage.textContent = "Rezervace byla zrušena.";
      adminMessage.classList.add("success");
    } catch (e) {
      console.error(e);
      adminMessage.textContent = "Nepodařilo se zrušit rezervaci.";
      adminMessage.classList.add("error");
    }
  }

  clearAllBtn.addEventListener("click", async () => {
    if (!confirm("Opravdu chcete vymazat všechny rezervace? Tuto akci nelze vrátit.")) {
      return;
    }
    adminMessage.textContent = "Mažu všechny rezervace...";
    adminMessage.className = "form-message";
    try {
      const snapshot = await getDocs(reservationsCol);
      const promises = snapshot.docs.map((d) =>
        deleteDoc(doc(db, "reservations", d.id))
      );
      await Promise.all(promises);
      await loadData();
      adminMessage.textContent = "Všechny rezervace byly vymazány.";
      adminMessage.classList.add("success");
    } catch (e) {
      console.error(e);
      adminMessage.textContent = "Nepodařilo se vymazat všechny rezervace.";
      adminMessage.classList.add("error");
    }
  });
});

