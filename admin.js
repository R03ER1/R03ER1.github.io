// ---------- Firebase inicializace ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  addDoc,
  doc,
  runTransaction,
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
  const adminReservationForm = document.getElementById("admin-reservation-form");
  const adminNameInput = document.getElementById("admin-name");
  const adminRoomSelect = document.getElementById("admin-room");
  const adminTableSelect = document.getElementById("admin-table");
  const adminSeatsContainer = document.getElementById("admin-seats-container");
  const adminFormMessage = document.getElementById("admin-form-message");

  let reservations = []; // {id, data}
  let adminSelectedSeatNumbers = new Set();

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
    initializeAdminForm();
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

  function getFreeSeatCount(roomId, table) {
    const takenSeatNumbers = new Set(
      reservations
        .filter((r) => r.roomId === roomId && r.tableId === table.id)
        .map((r) => r.seatNumber)
    );
    return table.seatCount - takenSeatNumbers.size;
  }

  function initializeAdminForm() {
    if (!adminReservationForm) return;

    populateAdminTables();
    renderAdminSeats();

    adminRoomSelect.addEventListener("change", () => {
      populateAdminTables();
      renderAdminSeats();
      clearAdminSelection();
    });

    adminTableSelect.addEventListener("change", () => {
      renderAdminSeats();
      clearAdminSelection();
    });

    adminReservationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!adminFormMessage) return;

      adminFormMessage.textContent = "";
      adminFormMessage.className = "form-message";

      const name = (adminNameInput?.value || "").trim();
      if (!name) {
        adminFormMessage.textContent = "Zadejte prosím jméno a příjmení.";
        adminFormMessage.classList.add("error");
        return;
      }

      if (adminSelectedSeatNumbers.size === 0) {
        adminFormMessage.textContent =
          "Vyberte alespoň jedno volné místo, které chcete přidat.";
        adminFormMessage.classList.add("error");
        return;
      }

      const roomId = adminRoomSelect.value;
      const room = ROOMS[roomId];
      const tableId = adminTableSelect.value;
      const table = room?.tables.find((t) => t.id === tableId);

      if (!room || !table) {
        adminFormMessage.textContent =
          "Vyberte prosím platný sál a stůl.";
        adminFormMessage.classList.add("error");
        return;
      }

      const takenSeatNumbers = new Set(
        reservations
          .filter((r) => r.roomId === room.id && r.tableId === table.id)
          .map((r) => r.seatNumber)
      );

      const newlyTaken = [];
      adminSelectedSeatNumbers.forEach((n) => {
        if (takenSeatNumbers.has(n)) {
          newlyTaken.push(n);
        }
      });

      if (newlyTaken.length > 0) {
        adminFormMessage.textContent =
          "Některá z vybraných míst byla mezitím obsazena: " +
          newlyTaken.join(", ") +
          ". Obnovte prosím výběr.";
        adminFormMessage.classList.add("error");
        renderAdminSeats();
        return;
      }

      const nowIso = new Date().toISOString();
      const selectedSeatArray = Array.from(adminSelectedSeatNumbers);

      try {
        // Přidáme místa pomocí transakce, abychom zabránili kolizi
        await runTransaction(db, async (transaction) => {
          for (const seatNumber of selectedSeatArray) {
            const seatDocId = `${room.id}_${table.id}_${seatNumber}`;
            const seatDocRef = doc(reservationsCol, seatDocId);
            const seatSnap = await transaction.get(seatDocRef);
            if (seatSnap.exists()) {
              throw new Error("seat-already-taken");
            }
            transaction.set(seatDocRef, {
              name,
              roomId: room.id,
              tableId: table.id,
              tableNumber: table.number,
              seatNumber,
              createdAt: nowIso,
            });
          }
        });
        await loadData();

        adminFormMessage.textContent =
          "Rezervace byla úspěšně přidána.";
        adminFormMessage.classList.add("success");
        clearAdminSelection();
        if (adminNameInput) {
          adminNameInput.value = "";
        }
      } catch (e) {
        console.error(e);
        if (e && e.message === "seat-already-taken") {
          adminFormMessage.textContent =
            "Některé z vybraných míst bylo právě obsazeno jiným uživatelem. Obnovte prosím výběr.";
          adminFormMessage.classList.add("error");
          renderAdminSeats();
        } else {
          adminFormMessage.textContent =
            "Při ukládání rezervace došlo k chybě. Zkuste to prosím znovu.";
          adminFormMessage.classList.add("error");
        }
      }
    });
  }

  function populateAdminTables() {
    const roomId = adminRoomSelect.value;
    const room = ROOMS[roomId];
    if (!room || !adminTableSelect) return;

    const previousTableId = adminTableSelect.value || null;
    adminTableSelect.innerHTML = "";

    room.tables.forEach((table) => {
      const option = document.createElement("option");
      option.value = table.id;
      const free = getFreeSeatCount(room.id, table);
      option.textContent = `Stůl ${table.number} (${free}/${table.seatCount})`;
      adminTableSelect.appendChild(option);
    });

    if (previousTableId) {
      const exists = room.tables.some((t) => t.id === previousTableId);
      if (exists) {
        adminTableSelect.value = previousTableId;
      }
    }
  }

  function renderAdminSeats() {
    if (!adminSeatsContainer) return;

    const roomId = adminRoomSelect.value;
    const room = ROOMS[roomId];
    const tableId = adminTableSelect.value;
    const table = room?.tables.find((t) => t.id === tableId);

    if (!room || !table) {
      adminSeatsContainer.innerHTML = "";
      return;
    }

    const takenSeatNumbers = new Set(
      reservations
        .filter((r) => r.roomId === room.id && r.tableId === table.id)
        .map((r) => r.seatNumber)
    );

    adminSelectedSeatNumbers = new Set();
    adminSeatsContainer.innerHTML = "";

    for (let i = 1; i <= table.seatCount; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seat";
      btn.textContent = i.toString();

      if (takenSeatNumbers.has(i)) {
        btn.classList.add("taken");
        btn.title = "Místo je již obsazené";
      } else {
        btn.classList.add("free");
        btn.addEventListener("click", () =>
          toggleAdminSeatSelection(i, btn)
        );
      }

      adminSeatsContainer.appendChild(btn);
    }
  }

  function toggleAdminSeatSelection(seatNumber, element) {
    if (adminSelectedSeatNumbers.has(seatNumber)) {
      adminSelectedSeatNumbers.delete(seatNumber);
      element.classList.remove("selected");
      element.classList.add("free");
    } else {
      adminSelectedSeatNumbers.add(seatNumber);
      element.classList.remove("free");
      element.classList.add("selected");
    }
  }

  function clearAdminSelection() {
    adminSelectedSeatNumbers = new Set();
    if (!adminSeatsContainer) return;
    const buttons =
      adminSeatsContainer.querySelectorAll(".seat.free, .seat.selected");
    buttons.forEach((btn) => {
      if (!btn.classList.contains("taken")) {
        btn.classList.remove("selected");
        btn.classList.add("free");
      }
    });
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

    // Přidáme také řádky pro místa na stání (speciální "sál" Stání, stůl 0)
    const standingReservations = reservations
      .filter((r) => r.roomId === "Stání")
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    standingReservations.forEach((res) => {
      const tr = document.createElement("tr");
      tr.style.background = "#fef2f2";

      const tdRoom = document.createElement("td");
      tdRoom.textContent = "Stání";
      tdRoom.style.padding = "4px 6px";

      const tdTable = document.createElement("td");
      tdTable.textContent = "0";
      tdTable.style.padding = "4px 6px";

      const tdSeat = document.createElement("td");
      tdSeat.textContent = String(res.seatNumber ?? "");
      tdSeat.style.padding = "4px 6px";

      const tdStatus = document.createElement("td");
      tdStatus.style.padding = "4px 6px";
      tdStatus.textContent = `Obsazeno – ${res.name ?? ""}`;

      const tdAction = document.createElement("td");
      tdAction.style.padding = "4px 6px";

      const btn = document.createElement("button");
      btn.textContent = "Zrušit";
      btn.className = "btn secondary";
      btn.style.padding = "4px 10px";
      btn.style.fontSize = "0.75rem";
      btn.addEventListener("click", async () => {
        if (
          !confirm(
            `Opravdu zrušit rezervaci stání (místo ${res.seatNumber}) pro ${res.name}?`
          )
        ) {
          return;
        }
        await deleteReservation(res.id);
      });
      tdAction.appendChild(btn);

      tr.appendChild(tdRoom);
      tr.appendChild(tdTable);
      tr.appendChild(tdSeat);
      tr.appendChild(tdStatus);
      tr.appendChild(tdAction);

      allRows.push(tr);
    });

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

