// ---------- Firebase inicializace ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  getDocs,
  doc,
  runTransaction,
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
const paymentsCol = collection(db, "payments");
const votesCol = collection(db, "votes");

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
  // Časy v UTC: CET = UTC+1 (platí do začátku letního času koncem března)
  const orgAccessUntilUtc = Date.UTC(2026, 2, 16, 21, 0); // 16. 3. 2026 22:00 CET
  const publicAccessFromUtc = Date.UTC(2026, 2, 18, 16, 0); // 18. 3. 2026 17:00 CET
  // null = rezervace bez automatického konce; pro uzávěrku zadejte např. Date.UTC(2026, 2, 26, 11, 0, 0)
  const reservationsEndUtc = null;

  const form = document.getElementById("reservation-form");
  const nameInput = document.getElementById("name");
  const standingCountInput = document.getElementById("standing-count");
  const roomSelect = document.getElementById("room");
  const tableSelect = document.getElementById("table");
  const seatsContainer = document.getElementById("seats-container");
  const formMessage = document.getElementById("form-message");
  const paymentInfo = document.getElementById("payment-info");
  const clearSelectionBtn = document.getElementById("clear-selection");
  const takenSeatsDiv = document.getElementById("taken-seats");
  const downloadCsvBtn = document.getElementById("download-csv");
  const downloadGuestsPdfBtn = document.getElementById("download-guests-pdf");
  const guestPrintOverlay = document.getElementById("guest-print-overlay");
  const guestPrintSheet = document.getElementById("guest-print-sheet");
  const guestPrintClose = document.getElementById("guest-print-close");
  const guestPrintTrigger = document.getElementById("guest-print-trigger");
  const tableSlipsOverlay = document.getElementById("table-slips-overlay");
  const tableSlipsSheet = document.getElementById("table-slips-sheet");
  const tableSlipsClose = document.getElementById("table-slips-close");
  const tableSlipsTrigger = document.getElementById("table-slips-print-trigger");
  const downloadTableSlipsBtn = document.getElementById("download-table-slips-print");
  const tableSlipsPerPage = document.getElementById("table-slips-per-page");

  function closeGuestPrintOverlay() {
    if (guestPrintOverlay) {
      guestPrintOverlay.classList.add("hidden");
      guestPrintOverlay.setAttribute("aria-hidden", "true");
    }
    if (guestPrintSheet) guestPrintSheet.innerHTML = "";
    document.body.classList.remove("guest-print-open");
  }

  function closeTableSlipsOverlay() {
    if (tableSlipsOverlay) {
      tableSlipsOverlay.classList.add("hidden");
      tableSlipsOverlay.setAttribute("aria-hidden", "true");
    }
    if (tableSlipsSheet) tableSlipsSheet.innerHTML = "";
    document.body.classList.remove("guest-print-open");
  }

  guestPrintClose?.addEventListener("click", closeGuestPrintOverlay);
  guestPrintTrigger?.addEventListener("click", () => {
    window.print();
  });
  tableSlipsClose?.addEventListener("click", closeTableSlipsOverlay);
  tableSlipsTrigger?.addEventListener("click", () => {
    window.print();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (guestPrintOverlay && !guestPrintOverlay.classList.contains("hidden")) {
      closeGuestPrintOverlay();
    } else if (tableSlipsOverlay && !tableSlipsOverlay.classList.contains("hidden")) {
      closeTableSlipsOverlay();
    }
  });
  const togglePublicTableBtn = document.getElementById("toggle-public-table");
  const publicTableContainer = document.getElementById("public-table-container");
  const publicTableBody = document.getElementById("public-table-body");
  const togglePeopleTableBtn = document.getElementById("toggle-people-table");
  const peopleTableContainer = document.getElementById("people-table-container");
  const peopleTableBody = document.getElementById("people-table-body");
  const toggleDebtorsListBtn = document.getElementById("toggle-debtors-list");
  const debtorsListContainer = document.getElementById("debtors-list-container");
  const priceRoom1Count = document.getElementById("price-room1-count");
  const priceRoom1Total = document.getElementById("price-room1-total");
  const priceRoom2Count = document.getElementById("price-room2-count");
  const priceRoom2Total = document.getElementById("price-room2-total");
  const priceTotal = document.getElementById("price-total");
  const voteYesBtn = document.getElementById("vote-yes");
  const voteNoBtn = document.getElementById("vote-no");
  const voteMessage = document.getElementById("vote-message");
  const voteStats = document.getElementById("vote-stats");

  let selectedSeatNumbers = new Set();

  // Realtime posluchač Firestore – kdykoli kdokoli něco zarezervuje,
  // přijdou nové data všem uživatelům
  onSnapshot(reservationsCol, (snapshot) => {
    reservations = snapshot.docs.map((doc) => doc.data());
    updateRoomOptions();
    populateTables(true);
    renderSeats();
    renderTakenSeatsInfo();
    if (publicTableContainer && !publicTableContainer.classList.contains("hidden")) {
      renderPublicTable();
    }
    if (peopleTableContainer && !peopleTableContainer.classList.contains("hidden")) {
      renderPeopleTable();
    }
    if (debtorsListContainer && !debtorsListContainer.classList.contains("hidden")) {
      renderDebtorsList();
    }
  });

  onSnapshot(paymentsCol, () => {
    if (debtorsListContainer && !debtorsListContainer.classList.contains("hidden")) {
      renderDebtorsList();
    }
    if (peopleTableContainer && !peopleTableContainer.classList.contains("hidden")) {
      renderPeopleTable();
    }
  });

  function getRoomSeatStats(roomId) {
    const room = ROOMS[roomId];
    if (!room) {
      return { total: 0, taken: 0, free: 0 };
    }

    const total = room.tables.reduce((sum, table) => sum + table.seatCount, 0);
    const taken = reservations.filter(
      (r) => r.roomId === roomId && r.roomId !== "Stání"
    ).length;
    const free = Math.max(0, total - taken);
    return { total, taken, free };
  }

  function updateRoomOptions() {
    if (!roomSelect) return;

    Object.values(ROOMS).forEach((room) => {
      let option = roomSelect.querySelector(`option[value="${room.id}"]`);
      if (!option) {
        option = document.createElement("option");
        option.value = room.id;
        roomSelect.appendChild(option);
      }

      const { free, total } = getRoomSeatStats(room.id);
      option.textContent = `${room.name} (${free}/${total})`;
    });
  }

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

    const reservationsEnded =
      reservationsEndUtc != null && Date.now() >= reservationsEndUtc;

    for (let i = 1; i <= table.seatCount; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seat";
      btn.textContent = i.toString();

      if (takenSeatNumbers.has(i)) {
        btn.classList.add("taken");
        btn.title = "Místo je již obsazené";
      } else if (reservationsEnded) {
        btn.classList.add("deadline-locked");
        btn.disabled = true;
        btn.title = "Lhůta pro nové rezervace skončila";
      } else {
        btn.classList.add("free");
        btn.addEventListener("click", () => toggleSeatSelection(i, btn));
      }

      seatsContainer.appendChild(btn);
    }

    updatePriceSummary();
  }

  function toggleSeatSelection(seatNumber, element) {
    if (reservationsEndUtc != null && Date.now() >= reservationsEndUtc) return;

    if (selectedSeatNumbers.has(seatNumber)) {
      selectedSeatNumbers.delete(seatNumber);
      element.classList.remove("selected");
      element.classList.add("free");
    } else {
      selectedSeatNumbers.add(seatNumber);
      element.classList.remove("free");
      element.classList.add("selected");
    }

    updatePriceSummary();
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

    updatePriceSummary();
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
    if (paymentInfo) {
      paymentInfo.innerHTML = "";
    }

    if (reservationsEndUtc != null && Date.now() >= reservationsEndUtc) {
      formMessage.textContent =
        "Rezervace nových míst už nejsou možné (lhůta pro rezervace skončila).";
      formMessage.classList.add("error");
      return;
    }

    const name = nameInput.value.trim();
    if (!name) {
      formMessage.textContent = "Zadejte prosím své jméno a příjmení.";
      formMessage.classList.add("error");
      return;
    }

    if (selectedSeatNumbers.size === 0) {
      formMessage.textContent = "Vyberte alespoň jedno volné místo u stolu.";
      formMessage.classList.add("error");
      return;
    }

    const { room, table } = getCurrentTable();
    if (!room || !table) {
      formMessage.textContent = "Vyberte prosím platný sál a stůl.";
      formMessage.classList.add("error");
      return;
    }

    // Limit lístků na osobu (pouze lístky u stolů; stání se nepočítá)
    const MAX_TICKETS_PER_NAME = 8;
    const existingTicketsForName = reservations.filter(
      (r) => (r.name || "").trim() === name && r.roomId !== "Stání"
    ).length;
    const remainingQuota = MAX_TICKETS_PER_NAME - existingTicketsForName;
    if (remainingQuota <= 0) {
      formMessage.textContent =
        `Pro jméno "${name}" už je zarezervováno ${existingTicketsForName} lístků. ` +
        `Limit je ${MAX_TICKETS_PER_NAME} lístků na osobu.`;
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
    const selectedSeatArrayAll = Array.from(selectedSeatNumbers).sort((a, b) => a - b);
    const selectedSeatArray = selectedSeatArrayAll.slice(0, remainingQuota);
    const wasTruncatedByLimit = selectedSeatArray.length < selectedSeatArrayAll.length;

    if (selectedSeatArray.length === 0) {
      formMessage.textContent =
        `Limit ${MAX_TICKETS_PER_NAME} lístků na osobu byl dosažen.`;
      formMessage.classList.add("error");
      return;
    }

    const seatCountForPrice = selectedSeatArray.length;
    const ticketPricePerSeat = room.id === "room1" ? 450 : 420;
    const totalPrice = seatCountForPrice * ticketPricePerSeat;
    try {
      // Zapíšeme každé vybrané místo u stolu pomocí transakce,
      // aby se předešlo dvojímu obsazení stejného místa.
      await runTransaction(db, async (transaction) => {
        // 1) Nejprve načteme všechny dokumenty (všechny čtení před zápisy)
        const seatRefs = selectedSeatArray.map((seatNumber) => {
          const seatDocId = `${room.id}_${table.id}_${seatNumber}`;
          return { seatNumber, ref: doc(reservationsCol, seatDocId) };
        });

        const snapshots = await Promise.all(
          seatRefs.map(({ ref }) => transaction.get(ref))
        );

        const alreadyTaken = snapshots.some((snap) => snap.exists());
        if (alreadyTaken) {
          throw new Error("seat-already-taken");
        }

        // 2) Až potom zapíšeme všechna místa
        seatRefs.forEach(({ seatNumber, ref }) => {
          transaction.set(ref, {
            name,
            roomId: room.id,
            tableId: table.id,
            tableNumber: table.number,
            seatNumber,
            createdAt: nowIso,
          });
        });
      });

      // Přidáme také místa na stání jako speciální "sál" Stání, stůl 0
      const standingCountRaw = standingCountInput ? standingCountInput.value : "0";
      const standingCount = Math.max(
        0,
        Number.isNaN(parseInt(standingCountRaw, 10))
          ? 0
          : parseInt(standingCountRaw, 10)
      );

      if (standingCount > 0) {
        const standingRoomId = "Stání";
        const standingTableId = "standing-0";
        const standingTableNumber = 0;

        const existingStanding = reservations.filter(
          (r) => r.roomId === standingRoomId && r.tableId === standingTableId
        );
        let maxSeatNumber =
          existingStanding.length === 0
            ? 0
            : existingStanding.reduce(
                (max, r) =>
                  typeof r.seatNumber === "number" && !Number.isNaN(r.seatNumber)
                    ? Math.max(max, r.seatNumber)
                    : max,
                0
              );

        for (let i = 0; i < standingCount; i++) {
          maxSeatNumber += 1;
          await addDoc(reservationsCol, {
            name,
            roomId: standingRoomId,
            tableId: standingTableId,
            tableNumber: standingTableNumber,
            seatNumber: maxSeatNumber,
            createdAt: nowIso,
          });
        }
      }

      formMessage.textContent = "Rezervace proběhla úspěšně. Děkujeme!";
      formMessage.classList.add("success");
      if (wasTruncatedByLimit) {
        formMessage.textContent =
          `Byl překročen limit ${MAX_TICKETS_PER_NAME} lístků na osobu. ` +
          `Zarezervováno bylo pouze ${selectedSeatArray.length} míst z ${selectedSeatArrayAll.length}.`;
      }
      if (paymentInfo) {
        const formattedTotal = `${totalPrice} Kč`;
        paymentInfo.innerHTML = `
          <span>Celková částka za tuto objednávku je <strong>${formattedTotal}</strong>.</span>
          <div style="margin-top:8px;">
            <img src="img/qr.jpg" alt="QR kód k platbě" style="max-width:220px; width:100%; height:auto; border-radius:12px;">
          </div>
        `;
      }
      clearSelection();
    } catch (e) {
      console.error(e);
      if (e && e.message === "seat-already-taken") {
        formMessage.textContent =
          "Některé z vybraných míst bylo právě obsazeno jiným uživatelem. Obnovte prosím výběr.";
        formMessage.classList.add("error");
        renderSeats();
        renderTakenSeatsInfo();
      } else {
        formMessage.textContent =
          "Při ukládání rezervace došlo k chybě. Zkuste to prosím znovu.";
        formMessage.classList.add("error");
      }
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

    updatePriceSummary();
  });

  tableSelect.addEventListener("change", () => {
    renderSeats();
    renderTakenSeatsInfo();
    updatePriceSummary();
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

  if (togglePeopleTableBtn && peopleTableContainer) {
    togglePeopleTableBtn.addEventListener("click", () => {
      const isHidden = peopleTableContainer.classList.contains("hidden");
      peopleTableContainer.classList.toggle("hidden", !isHidden);
      togglePeopleTableBtn.textContent = isHidden
        ? "Skrýt přehled podle lidí"
        : "Zobrazit přehled podle lidí";
      if (isHidden) {
        renderPeopleTable();
      }
    });
  }

  if (toggleDebtorsListBtn && debtorsListContainer) {
    toggleDebtorsListBtn.addEventListener("click", () => {
      const isHidden = debtorsListContainer.classList.contains("hidden");
      debtorsListContainer.classList.toggle("hidden", !isHidden);
      toggleDebtorsListBtn.textContent = isHidden
        ? "Skrýt seznam dlužníků"
        : "Zobrazit seznam dlužníků";
      if (isHidden) {
        renderDebtorsList();
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

  // Seznam hostů – A4 tisk / uložení jako PDF (data z Firestore, UTF-8)
  if (downloadGuestsPdfBtn) {
    downloadGuestsPdfBtn.addEventListener("click", async () => {
      try {
        const [resSnap, paySnap] = await Promise.all([
          getDocs(reservationsCol),
          getDocs(paymentsCol),
        ]);
        const allRes = resSnap.docs.map((d) => d.data());
        if (allRes.length === 0) {
          alert("Zatím nejsou žádné rezervace.");
          return;
        }

        const statsByName = new Map();
        allRes.forEach((r) => {
          const name = (r.name || "").trim();
          if (!name) return;

          if (!statsByName.has(name)) {
            statsByName.set(name, {
              totalDue: 0,
            });
          }
          const stats = statsByName.get(name);
          if (r.roomId === "room1") {
            stats.totalDue += 450;
          } else if (r.roomId === "room2") {
            stats.totalDue += 420;
          }
        });

        const paymentsByName = new Map();
        paySnap.docs.forEach((d) => {
          const data = d.data();
          const name = (data.name || d.id || "").trim();
          if (!name) return;
          paymentsByName.set(name, Number(data.totalPaid) || 0);
        });

        const sortedNames = Array.from(statsByName.keys()).sort((a, b) =>
          a.localeCompare(b, "cs", { sensitivity: "base" })
        );

        const today = new Date().toLocaleDateString("cs-CZ");
        const rowsHtml = sortedNames
          .map((name) => {
            const stats = statsByName.get(name);
            const paid = paymentsByName.get(name) || 0;
            const remaining = stats.totalDue - paid;
            const lines = allRes
              .filter((r) => (r.name || "").trim() === name)
              .sort(sortReservationsForPerson)
              .map(
                (r) =>
                  `<li>${escapeHtml(reservationLineText(r))}</li>`
              )
              .join("");
            return (
              "<tr>" +
              `<td>${escapeHtml(name)}</td>` +
              `<td class="guest-print-num">${escapeHtml(`${remaining} Kč`)}</td>` +
              `<td><ul>${lines || "<li>—</li>"}</ul></td>` +
              "</tr>"
            );
          })
          .join("");

        if (!guestPrintSheet || !guestPrintOverlay) {
          alert("Chybí prvky pro zobrazení tisku.");
          return;
        }

        guestPrintSheet.innerHTML =
          "<h1>Seznam hostů</h1>" +
          `<p class="guest-print-meta">Maturitní ples – vygenerováno ${escapeHtml(today)}</p>` +
          "<table class=\"guest-print-table\"><thead><tr>" +
          "<th style=\"width:26%;\">Jméno</th>" +
          "<th>Zbývá zaplatit</th>" +
          "<th>Rezervovaná místa</th>" +
          "</tr></thead><tbody>" +
          rowsHtml +
          "</tbody></table>";

        closeTableSlipsOverlay();
        guestPrintOverlay.classList.remove("hidden");
        guestPrintOverlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("guest-print-open");
        guestPrintSheet.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        console.error(e);
        alert("Nepodařilo se načíst data.");
      }
    });
  }

  // Lístečky ke stolům (A4: 2 / 3 / 4 na stránku, střih podle čar)
  if (downloadTableSlipsBtn) {
    downloadTableSlipsBtn.addEventListener("click", async () => {
      try {
        const perPage = tableSlipsPerPage ? tableSlipsPerPage.value : "4";
        const resSnap = await getDocs(reservationsCol);
        const allRes = resSnap.docs.map((d) => d.data());

        if (!tableSlipsSheet || !tableSlipsOverlay) {
          alert("Chybí prvky pro zobrazení tisku.");
          return;
        }

        tableSlipsSheet.innerHTML = buildTableSlipsSheetHtml(allRes, perPage);
        closeGuestPrintOverlay();
        tableSlipsOverlay.classList.remove("hidden");
        tableSlipsOverlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("guest-print-open");
        tableSlipsOverlay.scrollTop = 0;
        const slipsInner = tableSlipsOverlay.querySelector(".guest-print-inner");
        if (slipsInner) slipsInner.scrollTop = 0;
      } catch (e) {
        console.error(e);
        alert("Nepodařilo se načíst rezervace.");
      }
    });
  }

  // ----- Hlasování o zrušení maturáku -----
  onSnapshot(votesCol, (snapshot) => {
    const votes = snapshot.docs.map((doc) => doc.data());
    const yes = votes.filter((v) => v.value === "yes").length;
    const no = votes.filter((v) => v.value === "no").length;
    const total = yes + no;

    if (!voteStats) return;

    if (total === 0) {
      voteStats.textContent = "Zatím nikdo nehlasoval.";
      return;
    }

    const yesPct = ((yes / total) * 100).toFixed(1);
    const noPct = ((no / total) * 100).toFixed(1);
    voteStats.innerHTML =
      `Hlasy celkem: ${total}<br>` +
      `NEZRUŠIT: ${yes} (<strong>${yesPct} %</strong>) &nbsp; | &nbsp; ` +
      `ZRUŠIT: ${no} (<strong>${noPct} %</strong>)`;
  });

  const VOTE_STORAGE_KEY = "maturakVote2026";

  function getStoredVote() {
    try {
      return localStorage.getItem(VOTE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function storeVote(value) {
    try {
      localStorage.setItem(VOTE_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }

  async function handleVote(value) {
    if (!voteMessage) return;

    const existing = getStoredVote();
    if (existing) {
      voteMessage.className = "form-message";
      voteMessage.textContent =
        "Z tohoto prohlížeče už bylo hlasováno. Děkujeme.";
      return;
    }

    voteMessage.className = "form-message";
    voteMessage.textContent = "Ukládám váš hlas...";

    try {
      await addDoc(votesCol, {
        value,
        createdAt: new Date().toISOString(),
      });
      storeVote(value);
      voteMessage.className = "form-message success";
      voteMessage.textContent = "Hlas byl uložen. Děkujeme!";
    } catch (e) {
      console.error(e);
      voteMessage.className = "form-message error";
      voteMessage.textContent =
        "Nepodařilo se uložit hlas. Zkuste to prosím znovu.";
    }
  }

  if (voteYesBtn) {
    voteYesBtn.addEventListener("click", () => handleVote("yes"));
  }

  if (voteNoBtn) {
    voteNoBtn.addEventListener("click", () => handleVote("no"));
  }

  // ----- Odemčení rezervací dle času -----
  // Konstanty orgAccessUntilUtc, publicAccessFromUtc, reservationsEndUtc jsou nahoře v callbacku.
  // - do 16. 3. 2026 22:00 CET povoleno pro organizátory
  // - poté krátké zamčení s odpočtem do 18. 3. 2026 17:00 CET
  // - po 18. 3. 2026 17:00 CET veřejné rezervace až do 26. 3. 2026 12:00 CET, pak konec
  const reserveButton = document.getElementById("reserve-submit");
  const reservationCountdown = document.getElementById("reservation-countdown");
  let prevReservationsEnded = null;

  function formatDuration(ms) {
    if (ms <= 0) return null;
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days} d`);
    if (hours > 0 || days > 0) parts.push(`${hours} h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes} min`);
    parts.push(`${seconds} s`);
    return parts.join(" ");
  }

  function updateReservationAvailability() {
    if (!reserveButton || !reservationCountdown) return;

    const now = Date.now();
    const reservationsEnded =
      reservationsEndUtc != null && now >= reservationsEndUtc;
    if (prevReservationsEnded !== reservationsEnded) {
      prevReservationsEnded = reservationsEnded;
      renderSeats();
    }

    if (reservationsEnded) {
      reserveButton.disabled = true;
      reservationCountdown.innerHTML =
        "<strong>Rezervace jsou ukončeny.</strong> Nové místo u stolu už nelze přidat.";
      return;
    }

    const diffToOrgEnd = orgAccessUntilUtc - now;
    const diffToPublicStart = publicAccessFromUtc - now;
    const diffToResEnd =
      reservationsEndUtc != null ? reservationsEndUtc - now : Infinity;

    // 1) Do 16. 3. 2026 22:00 CET – povoleno, info pro organizátory
    if (now < orgAccessUntilUtc) {
      reserveButton.disabled = false;
      reservationCountdown.textContent =
        "Rezervace jsou aktuálně otevřené (režim pro organizátory). Od 16. března 2026 ve 22:00 budou dočasně uzavřeny a znovu spuštěny pro veřejnost." +
        (reservationsEndUtc != null
          ? " Nové rezervace u stolů budou možné jen do stanoveného konce lhůty."
          : "");
      return;
    }

    // 2) Od 16. 3. 2026 22:00 CET do 18. 3. 2026 17:00 CET – zamknuto s odpočtem
    if (now >= orgAccessUntilUtc && now < publicAccessFromUtc) {
      reserveButton.disabled = true;
      const durationText = formatDuration(diffToPublicStart);
      reservationCountdown.innerHTML =
        `Rezervace pro veřejnost se spustí <strong>18. března 2026 v 17:00</strong>. Zbývá <strong>${durationText}</strong>.` +
        (reservationsEndUtc != null
          ? " Poté budou rezervace možné jen do konce vyhlášené lhůty."
          : "");
      return;
    }

    // 3) Po 18. 3. 2026 17:00 CET
    reserveButton.disabled = false;
    if (reservationsEndUtc == null) {
      reservationCountdown.textContent =
        "Rezervace jsou spuštěné. Můžete si vybrat místa a pokračovat v rezervaci.";
    } else {
      const untilEndText = formatDuration(diffToResEnd);
      reservationCountdown.innerHTML =
        "Rezervace jsou spuštěné. Nové místo u stolu lze přidat jen do konce vyhlášené lhůty. " +
        (untilEndText
          ? `Do konce lhůty zbývá <strong>${untilEndText}</strong>.`
          : "");
    }
  }

  updateReservationAvailability();
  setInterval(updateReservationAvailability, 1000);

  // start
  updateRoomOptions();
  populateTables();
  updatePriceSummary();
});

function updatePriceSummary() {
  const roomSelect = document.getElementById("room");
  const priceRoom1Count = document.getElementById("price-room1-count");
  const priceRoom1Total = document.getElementById("price-room1-total");
  const priceRoom2Count = document.getElementById("price-room2-count");
  const priceRoom2Total = document.getElementById("price-room2-total");
  const priceTotal = document.getElementById("price-total");

  if (
    !roomSelect ||
    !priceRoom1Count ||
    !priceRoom1Total ||
    !priceRoom2Count ||
    !priceRoom2Total ||
    !priceTotal
  ) {
    return;
  }

  const currentRoomId = roomSelect.value;
  const seatButtons = document.querySelectorAll(".seat.selected");
  const selectedCount = seatButtons.length;

  const room1Price = 450;
  const room2Price = 420;

  let countRoom1 = 0;
  let countRoom2 = 0;

  if (currentRoomId === "room1") {
    countRoom1 = selectedCount;
  } else if (currentRoomId === "room2") {
    countRoom2 = selectedCount;
  }

  const totalRoom1 = countRoom1 * room1Price;
  const totalRoom2 = countRoom2 * room2Price;
  const total = totalRoom1 + totalRoom2;

  priceRoom1Count.textContent = countRoom1.toString();
  priceRoom1Total.textContent = `${totalRoom1} Kč`;
  priceRoom2Count.textContent = countRoom2.toString();
  priceRoom2Total.textContent = `${totalRoom2} Kč`;
  priceTotal.textContent = `${total} Kč`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reservationLineText(r) {
  const roomName = ROOMS[r.roomId]?.name || r.roomId || "";
  if (r.roomId === "Stání") {
    return `${roomName} – místo ${r.seatNumber}`;
  }
  return `${roomName}, stůl ${r.tableNumber}, místo ${r.seatNumber}`;
}

function sortReservationsForPerson(a, b) {
  if (a.roomId === b.roomId) {
    if ((a.tableNumber || 0) === (b.tableNumber || 0)) {
      return (a.seatNumber || 0) - (b.seatNumber || 0);
    }
    return (a.tableNumber || 0) - (b.tableNumber || 0);
  }
  return (a.roomId || "").localeCompare(b.roomId || "");
}

function roomShortSal(roomKey) {
  return roomKey === "room1" ? "Hlavní sál" : "Malý sál";
}

/**
 * Lístečky ke stolům: HTML do #table-slips-sheet.
 * perPage: 2 | 3 | 4 | "4-graphic" (čtvrtiny s img/graphics.jpg, seznam ve spodní polovině).
 */
function buildTableSlipsSheetHtml(allRes, perPage) {
  const graphicMode = perPage === "4-graphic";
  const per = graphicMode
    ? 4
    : [2, 3, 4].includes(Number(perPage))
      ? Number(perPage)
      : 4;
  const slips = [];

  for (const roomKey of ["room1", "room2"]) {
    const room = ROOMS[roomKey];
    const shortSal = roomShortSal(roomKey);
    for (const table of room.tables) {
      const taken = allRes.filter(
        (r) => r.roomId === room.id && r.tableId === table.id
      );
      const bySeat = new Map();
      taken.forEach((r) => {
        bySeat.set(r.seatNumber, (r.name || "").trim() || "—");
      });
      const itemLis = [];
      for (let s = 1; s <= table.seatCount; s++) {
        const name = bySeat.get(s);
        itemLis.push(
          `<li><span class="table-slip-seat">${s}.</span> ${escapeHtml(name ? name : "Volné")}</li>`
        );
      }
      const itemsJoined = itemLis.join("");

      if (graphicMode) {
        slips.push(
          `<div class="table-slip table-slip--graphic">` +
            `<div class="table-slip-graphic-wrap">` +
            `<div class="table-slip-graphic-photo">` +
            `<img class="table-slip-graphic-img" src="img/graphics.jpg" alt="">` +
            `<div class="table-slip-graphic-mask" aria-hidden="true"></div>` +
            `<div class="table-slip-graphic-head">` +
            `<div class="table-slip-graphic-table-num">${table.number}</div>` +
            `<div class="table-slip-graphic-sal">${escapeHtml(shortSal)}</div>` +
            `</div>` +
            `</div>` +
            `<ul class="table-slip-list table-slip-list--graphic">${itemsJoined}</ul>` +
            `</div>` +
            `</div>`
        );
      } else {
        slips.push(
          `<div class="table-slip">` +
            `<div class="table-slip-head">` +
            `<div class="table-slip-title">STŮL ${table.number}</div>` +
            `<div class="table-slip-sub">${escapeHtml(shortSal)}</div>` +
            `</div>` +
            `<ul class="table-slip-list">${itemsJoined}</ul>` +
            `</div>`
        );
      }
    }
  }

  let gridClass;
  if (graphicMode) {
    gridClass = "table-slips-page--4 table-slips-page--4-graphic";
  } else if (per === 4) {
    gridClass = "table-slips-page--4";
  } else if (per === 3) {
    gridClass = "table-slips-page--3";
  } else {
    gridClass = "table-slips-page--2";
  }

  const pagesHtml = [];
  for (let i = 0; i < slips.length; i += per) {
    const slice = slips.slice(i, i + per);
    const padded = slice.slice();
    while (padded.length < per) {
      padded.push(
        '<div class="table-slip table-slip--empty" aria-hidden="true"></div>'
      );
    }
    pagesHtml.push(
      `<div class="table-slips-page ${gridClass}">${padded.join("")}</div>`
    );
  }

  const hintGraphic = graphicMode
    ? " Režim s plakátem – v tisku zapněte grafiku na pozadí."
    : "";
  const hint = `<p class="table-slips-screen-hint">Náhled: ${slips.length} stolů, na stránku ${per} lístečků (${graphicMode ? "grafická šablona" : "text"}). Po tisku stříhejte podle čar.${hintGraphic}</p>`;

  return hint + pagesHtml.join("");
}

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

async function renderPeopleTable() {
  const body = document.getElementById("people-table-body");
  if (!body) return;
  body.innerHTML = "";

  const statsByName = new Map();

  reservations.forEach((r) => {
    const name = (r.name || "").trim();
    if (!name) return;

    if (!statsByName.has(name)) {
      statsByName.set(name, {
        total: 0,
        room1: 0,
        room2: 0,
        standing: 0,
        totalDue: 0,
      });
    }

    const stats = statsByName.get(name);
    stats.total += 1;

    if (r.roomId === "room1") {
      stats.room1 += 1;
      stats.totalDue += 450;
    } else if (r.roomId === "room2") {
      stats.room2 += 1;
      stats.totalDue += 420;
    } else if (r.roomId === "Stání") {
      stats.standing += 1;
    }
  });

  // Načteme informace o již provedených platbách
  const paymentsSnapshot = await getDocs(paymentsCol);
  const paymentsByName = new Map();
  paymentsSnapshot.docs.forEach((d) => {
    const data = d.data();
    const name = (data.name || d.id || "").trim();
    if (!name) return;
    paymentsByName.set(name, Number(data.totalPaid) || 0);
  });

  const sortedNames = Array.from(statsByName.keys()).sort((a, b) =>
    a.localeCompare(b, "cs", { sensitivity: "base" })
  );

  sortedNames.forEach((name) => {
    const stats = statsByName.get(name);
    const paid = paymentsByName.get(name) || 0;
    const remaining = stats.totalDue - paid;
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    const tdName = document.createElement("td");
    tdName.textContent = name;
    tdName.style.padding = "4px 6px";

    const tdTotal = document.createElement("td");
    tdTotal.textContent = stats.total.toString();
    tdTotal.style.padding = "4px 6px";

    const tdRoom1 = document.createElement("td");
    tdRoom1.textContent = stats.room1.toString();
    tdRoom1.style.padding = "4px 6px";

    const tdRoom2 = document.createElement("td");
    tdRoom2.textContent = stats.room2.toString();
    tdRoom2.style.padding = "4px 6px";

    const tdRemaining = document.createElement("td");
    tdRemaining.textContent = `${remaining} Kč`;
    tdRemaining.style.padding = "4px 6px";
    if (remaining > 0) {
      tdRemaining.style.color = "#b91c1c"; // dluží
    } else if (remaining < 0) {
      tdRemaining.style.color = "#0f766e"; // přeplaceno
    } else {
      tdRemaining.style.color = "#16a34a"; // vyrovnáno
    }

    tr.appendChild(tdName);
    tr.appendChild(tdTotal);
    tr.appendChild(tdRoom1);
    tr.appendChild(tdRoom2);
    tr.appendChild(tdRemaining);

    // Detailní řádek s konkrétními místy
    const detailTr = document.createElement("tr");
    detailTr.style.display = "none";
    const detailTd = document.createElement("td");
    detailTd.colSpan = 5;
    detailTd.style.padding = "6px 8px 10px 8px";
    detailTd.style.backgroundColor = "#f9fafb";
    detailTd.style.fontSize = "0.8rem";

    const userReservations = reservations
      .filter((r) => (r.name || "").trim() === name)
      .sort((a, b) => {
        if (a.roomId === b.roomId) {
          if ((a.tableNumber || 0) === (b.tableNumber || 0)) {
            return (a.seatNumber || 0) - (b.seatNumber || 0);
          }
          return (a.tableNumber || 0) - (b.tableNumber || 0);
        }
        return (a.roomId || "").localeCompare(b.roomId || "");
      });

    if (userReservations.length === 0) {
      detailTd.textContent = "Žádné rezervace.";
    } else {
      const list = document.createElement("ul");
      list.style.margin = "0";
      list.style.paddingLeft = "18px";

      userReservations.forEach((r) => {
        const li = document.createElement("li");
        const roomName = ROOMS[r.roomId]?.name || r.roomId || "";
        if (r.roomId === "Stání") {
          li.textContent = `${roomName} – místo ${r.seatNumber}`;
        } else {
          li.textContent = `${roomName}, stůl ${r.tableNumber}, místo ${r.seatNumber}`;
        }
        list.appendChild(li);
      });

      detailTd.appendChild(list);
    }

    detailTr.appendChild(detailTd);

    tr.addEventListener("click", () => {
      const isHidden = detailTr.style.display === "none";
      if (isHidden) {
        detailTr.style.display = "table-row";
        detailTr.classList.add("details-row-fade-in");
        setTimeout(() => {
          detailTr.classList.remove("details-row-fade-in");
        }, 200);
      } else {
        detailTr.style.display = "none";
      }
    });

    body.appendChild(tr);
    body.appendChild(detailTr);
  });
}

function debtorsCountPhrase(n) {
  if (n === 0) return "Nikdo nedluží";
  if (n === 1) return "1 osoba dluží";
  if (n >= 2 && n <= 4) return `${n} osoby dluží`;
  return `${n} osob dluží`;
}

/** Hosté se vstupným k zaplacení (jen hlavní/malý sál, stejně jako sloupec „Zbývá zaplatit“). */
async function renderDebtorsList() {
  const listBody = document.getElementById("debtors-list-body");
  const summaryEl = document.getElementById("debtors-list-summary");
  if (!listBody) return;
  listBody.innerHTML = "";

  const statsByName = new Map();
  reservations.forEach((r) => {
    const name = (r.name || "").trim();
    if (!name) return;

    if (!statsByName.has(name)) {
      statsByName.set(name, { totalDue: 0 });
    }
    const stats = statsByName.get(name);
    if (r.roomId === "room1") {
      stats.totalDue += 450;
    } else if (r.roomId === "room2") {
      stats.totalDue += 420;
    }
  });

  const paymentsSnapshot = await getDocs(paymentsCol);
  const paymentsByName = new Map();
  paymentsSnapshot.docs.forEach((d) => {
    const data = d.data();
    const name = (data.name || d.id || "").trim();
    if (!name) return;
    paymentsByName.set(name, Number(data.totalPaid) || 0);
  });

  const debtors = [];
  statsByName.forEach((stats, name) => {
    const paid = paymentsByName.get(name) || 0;
    const remaining = stats.totalDue - paid;
    if (remaining > 0) {
      debtors.push({ name, remaining });
    }
  });

  debtors.sort((a, b) => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    return a.name.localeCompare(b.name, "cs", { sensitivity: "base" });
  });

  if (summaryEl) {
    if (debtors.length === 0) {
      summaryEl.textContent =
        "Nikdo z hostů s místy v hlavním nebo malém sále momentálně nedluží na vstupném (nebo ještě nejsou rezervace).";
    } else {
      const totalDebt = debtors.reduce((sum, d) => sum + d.remaining, 0);
      summaryEl.textContent = `${debtorsCountPhrase(debtors.length)} na vstupném celkem ${totalDebt} Kč (450 Kč / 420 Kč podle sálu; stání v částce není).`;
    }
  }

  debtors.forEach(({ name, remaining }) => {
    const li = document.createElement("li");
    li.className = "debtors-list-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "debtors-list-name";
    nameSpan.textContent = name;

    const amtSpan = document.createElement("span");
    amtSpan.className = "debtors-list-amount";
    amtSpan.textContent = `${remaining} Kč`;

    li.appendChild(nameSpan);
    li.appendChild(amtSpan);
    listBody.appendChild(li);
  });
}
