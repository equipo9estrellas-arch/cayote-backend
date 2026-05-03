app.post("/reservar", async (req, res) => {
  try {
    const { nombre, telefono, fecha, hora, personas } = req.body;

    if (!nombre || !telefono || !fecha || !hora || !personas) {
      return res.json({ error: "Faltan datos" });
    }

    // convertir fecha a día de la semana
    const fechaObj = new Date(fecha);
    const dia = fechaObj.getDay(); // 0 domingo, 1 lunes...

    // función para convertir hora a minutos
    const toMin = (h) => {
      const [hh, mm] = h.split(":").map(Number);
      return hh * 60 + mm;
    };

    const inicioNueva = toMin(hora);
    const finNueva = inicioNueva + 90;

    // definir horarios permitidos
    const horarios = {
      1: [[20 * 60, 23 * 60]], // lunes
      2: [[20 * 60, 23 * 60]], // martes
      3: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]], // miércoles
      4: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]], // jueves
      5: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]], // viernes
      6: [[13 * 60, 16 * 60], [20 * 60, 23 * 60]], // sábado
      0: [[13 * 60, 16 * 60]] // domingo
    };

    const turnos = horarios[dia] || [];

    // comprobar si la reserva entra en algún turno
    const dentroHorario = turnos.some(([inicio, fin]) => {
      return inicioNueva >= inicio && finNueva <= fin;
    });

    if (!dentroHorario) {
      return res.json({
        error: "Fuera del horario del restaurante"
      });
    }

    // obtener mesas
    const { data: mesas } = await supabase
      .from("mesas")
      .select("*")
      .order("capacidad", { ascending: false });

    // obtener reservas del día
    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha);

    // obtener relaciones mesas-reservas
    const { data: reservasMesas } = await supabase
      .from("reservas_mesas")
      .select("*");

    // filtrar mesas libres
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

    // seleccionar combinación de mesas
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

    // calcular hora_fin
    const finDate = new Date(0, 0, 0, 0, inicioNueva + 90);
    const hora_fin = finDate.toTimeString().slice(0, 5);

    // insertar reserva
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

    // insertar relación mesas
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