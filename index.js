require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.get("/", (req, res) => {
  res.send("Servidor funcionando");
});

// VER DISPONIBILIDAD (multi-mesa)
app.post("/availability", async (req, res) => {
  try {
    const { fecha, hora, personas } = req.body;

    const { data: mesas, error: errorMesas } = await supabase
      .from("mesas")
      .select("*");

    if (errorMesas) throw errorMesas;

    const { data: reservasRaw, error: errorReservas } = await supabase
      .from("reservas_mesas")
      .select(`
        mesa_id,
        reservas (
          fecha,
          hora_inicio,
          hora_fin
        )
      `);

    if (errorReservas) throw errorReservas;

    const reservas = reservasRaw || [];

    const mesasDisponibles = mesas.filter((mesa) => {
      const ocupadas = reservas.filter(
        (r) =>
          r.mesa_id === mesa.id &&
          r.reservas.fecha === fecha &&
          hora >= r.reservas.hora_inicio &&
          hora < r.reservas.hora_fin
      );
      return ocupadas.length === 0;
    });

    let capacidadTotal = 0;
    let mesasAsignadas = [];

    for (let mesa of mesasDisponibles) {
      mesasAsignadas.push(mesa.id);
      capacidadTotal += mesa.capacidad;

      if (capacidadTotal >= personas) break;
    }

    if (capacidadTotal >= personas) {
      return res.json({
        disponible: true,
        mesas: mesasAsignadas,
      });
    } else {
      return res.json({
        disponible: false,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// RESERVAR (multi-mesa)
app.post("/reservar", async (req, res) => {
  try {
    const { nombre, telefono, fecha, hora, personas } = req.body;

    const horaInicio = hora;
    const horaFin = "23:00";

    // 1. Obtener mesas
    const { data: mesas, error: errorMesas } = await supabase
      .from("mesas")
      .select("*");

    if (errorMesas) throw errorMesas;

    // 2. Obtener reservas existentes
    const { data: reservasRaw, error: errorReservas } = await supabase
      .from("reservas_mesas")
      .select(`
        mesa_id,
        reservas (
          fecha,
          hora_inicio,
          hora_fin
        )
      `);

    if (errorReservas) throw errorReservas;

    const reservas = reservasRaw || [];

    // 3. Filtrar mesas disponibles
    const mesasDisponibles = mesas.filter((mesa) => {
      const ocupadas = reservas.filter(
        (r) =>
          r.mesa_id === mesa.id &&
          r.reservas.fecha === fecha &&
          hora >= r.reservas.hora_inicio &&
          hora < r.reservas.hora_fin
      );
      return ocupadas.length === 0;
    });

    // 4. Seleccionar mesas necesarias
    let capacidadTotal = 0;
    let mesasAsignadas = [];

    for (let mesa of mesasDisponibles) {
      mesasAsignadas.push(mesa.id);
      capacidadTotal += mesa.capacidad;

      if (capacidadTotal >= personas) break;
    }

    if (capacidadTotal < personas) {
      return res.status(400).json({ error: "No hay suficiente capacidad" });
    }

    // 5. Crear reserva principal
    const { data: reserva, error: errorInsert } = await supabase
      .from("reservas")
      .insert([
        {
          nombre,
          telefono,
          fecha,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          personas,
        },
      ])
      .select()
      .single();

    if (errorInsert) throw errorInsert;

    // 6. Relacionar mesas
    const inserts = mesasAsignadas.map((mesa_id) => ({
      reserva_id: reserva.id,
      mesa_id,
    }));

    const { error: errorRelacion } = await supabase
      .from("reservas_mesas")
      .insert(inserts);

    if (errorRelacion) throw errorRelacion;

    return res.json({
      success: true,
      reserva_id: reserva.id,
      mesas: mesasAsignadas,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ESTADO DE MESAS
app.post("/estado-mesas", async (req, res) => {
  try {
    const { fecha, hora } = req.body;

    const { data: mesas } = await supabase.from("mesas").select("*");

    const { data: reservasRaw } = await supabase
      .from("reservas_mesas")
      .select(`
        mesa_id,
        reservas (
          fecha,
          hora_inicio,
          hora_fin
        )
      `);

    const reservas = reservasRaw || [];

    const estado = mesas.map((mesa) => {
      const ocupada = reservas.some(
        (r) =>
          r.mesa_id === mesa.id &&
          r.reservas.fecha === fecha &&
          hora >= r.reservas.hora_inicio &&
          hora < r.reservas.hora_fin
      );

      return {
        mesa_id: mesa.id,
        capacidad: mesa.capacidad,
        ocupada,
      };
    });

    res.json(estado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});