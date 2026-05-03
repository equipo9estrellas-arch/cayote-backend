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

// TEST
app.get("/", (req, res) => {
  res.send("Servidor funcionando");
});

// RESERVAR (MULTIMESA + HORARIOS)
app.post("/reservar", async (req, res) => {
  try {
    const { nombre, telefono, fecha, hora, personas } = req.body;

    if (!nombre || !telefono || !fecha || !hora || !personas) {
      return res.json({ error: "Faltan datos" });
    }

    const fechaObj = new Date(fecha);
    const dia = fechaObj.getDay();

    const toMin = (h) => {
      const [hh, mm] = h.split(":").map(Number);
      return hh * 60 + mm;
    };

    const inicioNueva = toMin(hora);
    const finNueva = inicioNueva + 90;

    const horarios = {
      1: [[20 * 60, 23 * 60]],
      2: [[20 * 60, 23 * 60]],
      3: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]],
      4: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]],
      5: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]],
      6: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]],
      0: [[13 * 60, 16 * 60]]
    };

    const turnos = horarios[dia] || [];

    const dentroHorario = turnos.some(([inicio, fin]) => {
      return inicioNueva >= inicio && finNueva <= fin;
    });

    if (!dentroHorario) {
      return res.json({ error: "Fuera del horario del restaurante" });
    }

    const { data: mesas } = await supabase
      .from("mesas")
      .select("*")
      .order("capacidad", { ascending: false });

    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha);

    const { data: reservasMesas } = await supabase
      .from("reservas_mesas")
      .select("*");

    const mesasLibres = mesas.filter((mesa) => {
      const relaciones = reservasMesas.filter(r => r.mesa_id === mesa.id);

      for (const rel of relaciones) {
        const reserva = reservas.find(r => r.id === rel.reserva_id);
        if (!reserva) continue;

        const inicio = toMin(reserva.hora_inicio);
        const fin = toMin(reserva.hora_fin);

        if (inicioNueva < fin && finNueva > inicio) {
          return false;
        }
      }

      return true;
    });

    let seleccion = [];
    let capacidadTotal = 0;

    for (const mesa of mesasLibres) {
      seleccion.push(mesa);
      capacidadTotal += mesa.capacidad;

      if (capacidadTotal >= personas) break;
    }

    if (capacidadTotal < personas) {
      return res.json({ error: "No hay capacidad suficiente" });
    }

    const finDate = new Date(0, 0, 0, 0, inicioNueva + 90);
    const hora_fin = finDate.toTimeString().slice(0, 5);

    const { data: nuevaReserva, error } = await supabase
      .from("reservas")
      .insert([
        {
          nombre,
          telefono,
          fecha,
          hora_inicio: hora,
          hora_fin,
          personas
        }
      ])
      .select()
      .single();

    if (error) throw error;

    const inserts = seleccion.map(m => ({
      reserva_id: nuevaReserva.id,
      mesa_id: m.id
    }));

    await supabase.from("reservas_mesas").insert(inserts);

    res.json({
      success: true,
      mesas: seleccion.map(m => m.nombre)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});