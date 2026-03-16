// ---------- Firebase inicializace ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
















// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAqYa5Lcl3KL5XvRGRBkAclnHj_XdIh3sI",
  authDomain: "maturak-rezervace-84e9c.firebaseapp.com",
  projectId: "maturak-rezervace-84e9c",
  storageBucket: "maturak-rezervace-84e9c.firebasestorage.app",
  messagingSenderId: "69611879820",
  appId: "1:69611879820:web:6e85e3281768a8bf846aa9",
  measurementId: "G-YFBBJXHJ8E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);

const db = getFirestore(app);
const reservationsCol = collection(db, "reservations");

// ---------- Konfigurace stolů ----------
// Počty míst u konkrétních stolů – pokud nesedí podle plánku, změň hodnoty tady.
// Povolené hodnoty: 5, 6, 7, 8, 9, 10, 12
const ROOM1_TABLE_SEATS = {
  1: 10,  2: 10,  3: 6,  4: 6,  5: 8, 6: 8,
  7: 8,  8: 8, 9: 6, 10: 6, 11: 6, 12: 6,
  13: 6, 14: 6, 15: 9, 16: 10, 17: 10, 18: 10,
  19: 10, 20: 7, 21: 8, 22: 5,
  // středové stoly – spíš menší, uprav podle potřeby
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

// Typ: { name, roomId, tableId, tableNumber, seatNumber, createdAt }
let reservations = [];

function getFreeSeatCount(roomId, table) {
  const takenSeatNumbers = new Set(
    reservations
      .filter((r) => r.roomId === roomId && r.tableId === table.id)
      .map((r) => r.seatNumber)
  );
  return table.seatCount - takenSeatNumbers.size;
}

// ---------- Aplikace ----------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("reservation-form");
  const nameInput = document.getElementById("name");
  const roomSelect = document.getElementById("room");
  const tableSelect = document.getElementById("table");
  const seatsContainer = document.getElementById("seats-container");
  const formMessage = document.getElementById("form-message");
  const clearSelectionBtn = document.getElementById("clear-selection");
  const takenSeatsDiv = document.getElementById("taken-seats");
  const downloadCsvBtn = document.getElementById("download-csv");
  const togglePublicTableBtn = document.getElementById("toggle-public-table");
  const publicTableContainer = document.getElementById("public-table-container");
  const publicTableBody = document.getElementById("public-table-body");

  let selectedSeatNumbers = new Set();

  // Realtime posluchač Firestore – kdykoli kdokoli něco zarezervuje,
  // přijdou nové data všem uživatelům
  onSnapshot(reservationsCol, (snapshot) => {
    reservations = snapshot.docs.map((doc) => doc.data());
    populateTables(true);
    renderSeats();
    renderTakenSeatsInfo();
    renderPublicTable();
  });

  function populateTables(keepSelection = false) {
    const roomId = roomSelect.value;
    const room = ROOMS[roomId];
    const previousTableId = keepSelection ? tableSelect.value : null;
    tableSelect.innerHTML = "";

    room.tables.forEach((table) => {
      const option = document.createElement("option");
      option.value = table.id;
      const free = getFreeSeatCount(room.id, table);
      option.textContent = `Stůl ${table.number} (${free}/${table.seatCount})`;
      tableSelect.appendChild(option);
    });

    if (keepSelection && previousTableId) {
      const exists = room.tables.some((t) => t.id === previousTableId);
      if (exists) {
        tableSelect.value = previousTableId;
      }
    }

    renderSeats();
    renderTakenSeatsInfo();
  }

  function getCurrentTable() {
    const roomId = roomSelect.value;
    const tableId = tableSelect.value;
    const room = ROOMS[roomId];
    const table = room.tables.find((t) => t.id === tableId);
    return { room, table };
  }

  function renderSeats() {
    const { room, table } = getCurrentTable();
    if (!room || !table) return;

    const takenSeatNumbers = new Set(
      reservations
        .filter((r) => r.roomId === room.id && r.tableId === table.id)
        .map((r) => r.seatNumber)
    );

    selectedSeatNumbers = new Set();
    seatsContainer.innerHTML = "";

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
        btn.addEventListener("click", () => toggleSeatSelection(i, btn));
      }

      seatsContainer.appendChild(btn);
    }
  }

  function toggleSeatSelection(seatNumber, element) {
    if (selectedSeatNumbers.has(seatNumber)) {
      selectedSeatNumbers.delete(seatNumber);
      element.classList.remove("selected");
      element.classList.add("free");
    } else {
      selectedSeatNumbers.add(seatNumber);
      element.classList.remove("free");
      element.classList.add("selected");
    }
  }

  function clearSelection() {
    selectedSeatNumbers = new Set();
    const buttons = seatsContainer.querySelectorAll(".seat.free, .seat.selected");
    buttons.forEach((btn) => {
      if (!btn.classList.contains("taken")) {
        btn.classList.remove("selected");
        btn.classList.add("free");
      }
    });
  }

  function renderTakenSeatsInfo() {
    const { room, table } = getCurrentTable();
    if (!room || !table) {
      takenSeatsDiv.textContent = "Vyberte sál a stůl.";
      return;
    }

    const tableReservations = reservations.filter(
      (r) => r.roomId === room.id && r.tableId === table.id
    );

    if (tableReservations.length === 0) {
      takenSeatsDiv.innerHTML = `<strong>Stůl ${table.number}:</strong> všechna místa jsou volná.`;
      return;
    }

    const seatInfo = tableReservations
      .sort((a, b) => a.seatNumber - b.seatNumber)
      .map((r) => `místo ${r.seatNumber} – ${r.name}`)
      .join("<br>");

    takenSeatsDiv.innerHTML = `<strong>Stůl ${table.number} (${room.name}):</strong><br>${seatInfo}`;
  }

  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const roomId = btn.dataset.room;

      document
        .querySelectorAll(".tab-button")
        .forEach((b) => b.classList.toggle("active", b === btn));

      document.querySelectorAll(".map-image").forEach((imgDiv) => {
        imgDiv.classList.toggle(
          "hidden",
          imgDiv.dataset.room !== roomId
        );
      });

      roomSelect.value = roomId;
      populateTables();
    });
  });

  // Odeslání formuláře – zápis do Firestore
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";
    formMessage.className = "form-message";

    const name = nameInput.value.trim();
    if (!name) {
      formMessage.textContent = "Zadejte prosím své jméno a příjmení.";
      formMessage.classList.add("error");
      return;
    }

    if (selectedSeatNumbers.size === 0) {
      formMessage.textContent = "Vyberte alespoň jedno volné místo.";
      formMessage.classList.add("error");
      return;
    }

    const { room, table } = getCurrentTable();
    if (!room || !table) {
      formMessage.textContent = "Vyberte prosím platný sál a stůl.";
      formMessage.classList.add("error");
      return;
    }

    const takenSeatNumbers = new Set(
      reservations
        .filter((r) => r.roomId === room.id && r.tableId === table.id)
        .map((r) => r.seatNumber)
    );

    const newlyTaken = [];
    selectedSeatNumbers.forEach((n) => {
      if (takenSeatNumbers.has(n)) {
        newlyTaken.push(n);
      }
    });

    if (newlyTaken.length > 0) {
      formMessage.textContent =
        "Některá z vybraných míst byla mezitím obsazena: " +
        newlyTaken.join(", ") +
        ". Obnovte prosím výběr.";
      formMessage.classList.add("error");
      renderSeats();
      renderTakenSeatsInfo();
      return;
    }

    const nowIso = new Date().toISOString();
    try {
      // Zapíšeme každé vybrané místo jako samostatný dokument
      const promises = Array.from(selectedSeatNumbers).map((seatNumber) =>
        addDoc(reservationsCol, {
          name,
          roomId: room.id,
          tableId: table.id,
          tableNumber: table.number,
          seatNumber,
          createdAt: nowIso,
        })
      );
      await Promise.all(promises);

      formMessage.textContent = "Rezervace proběhla úspěšně. Děkujeme!";
      formMessage.classList.add("success");
      clearSelection();
    } catch (e) {
      console.error(e);
      formMessage.textContent = "Při ukládání rezervace došlo k chybě. Zkuste to prosím znovu.";
      formMessage.classList.add("error");
    }
  });

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      clearSelection();
      formMessage.textContent = "";
      formMessage.className = "form-message";
    });
  }

  roomSelect.addEventListener("change", () => {
    populateTables();
    const roomId = roomSelect.value;
    document.querySelectorAll(".tab-button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.room === roomId);
    });
    document.querySelectorAll(".map-image").forEach((imgDiv) => {
      imgDiv.classList.toggle("hidden", imgDiv.dataset.room !== roomId);
    });
  });

  tableSelect.addEventListener("change", () => {
    renderSeats();
    renderTakenSeatsInfo();
  });

  if (togglePublicTableBtn && publicTableContainer) {
    togglePublicTableBtn.addEventListener("click", () => {
      const isHidden = publicTableContainer.classList.contains("hidden");
      publicTableContainer.classList.toggle("hidden", !isHidden);
      togglePublicTableBtn.textContent = isHidden
        ? "Skrýt přehled všech míst"
        : "Zobrazit přehled všech míst";
      if (isHidden) {
        renderPublicTable();
      }
    });
  }

  // Export CSV používá globální "reservations" z Firestore
  downloadCsvBtn.addEventListener("click", () => {
    if (reservations.length === 0) {
      alert("Zatím nejsou žádné rezervace k exportu.");
      return;
    }

    const header = [
      "Jméno",
      "Sál",
      "Číslo stolu",
      "Číslo místa",
      "Datum a čas vytvoření (ISO)",
    ];

    const rows = reservations.map((r) => {
      const roomName = ROOMS[r.roomId]?.name || r.roomId;
      return [
        r.name,
        roomName,
        r.tableNumber,
        r.seatNumber,
        r.createdAt,
      ];
    });

    const csvContent =
      [header, ...rows]
        .map((row) =>
          row
            .map((cell) => {
              const text = String(cell ?? "");
              if (/[",;\n]/.test(text)) {
                return `"${text.replace(/"/g, '""')}"`;
              }
              return text;
            })
            .join(";")
        )
        .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const today = new Date().toISOString().slice(0, 10);
    link.download = `rezervace_maturitni_ples_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  // start
  populateTables();
  renderPublicTable();
});

function renderPublicTable() {
  const body = document.getElementById("public-table-body");
  if (!body) return;
  body.innerHTML = "";

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

        tr.appendChild(tdRoom);
        tr.appendChild(tdTable);
        tr.appendChild(tdSeat);
        tr.appendChild(tdStatus);

        allRows.push(tr);
      }
    });
  });

  allRows.forEach((row) => body.appendChild(row));
}
