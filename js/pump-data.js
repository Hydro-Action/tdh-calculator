/*
 * Built-in pump library (ships with the app, read-only).
 * Add pumps here from the manufacturer spec sheets in the /Pumps folder.
 *
 * Each entry is one performance curve. Order numbers that share the curve
 * (voltage, phase, cord length, float options) are listed together in `models`.
 *   pts: [{ Q: gpm, H: ft }] from shutoff (Q = 0) to the end of the published curve.
 *   source: the document the data came from, and whether points are tabulated or read from a graph.
 */
(function (root) {
  'use strict';

  // Pump groups shown in the Chart tab. Order here = display order.
  const PUMP_CATEGORIES = [
    { id: 'he-filtered', label: 'High-head effluent: filtered (small solids)', note: 'Multi-stage effluent pumps for filtered or screened effluent. Not for raw sewage or large solids.' },
    { id: 'effluent', label: 'Effluent pumps', note: 'Single-stage effluent pumps that pass moderate solids (typically up to 3/4").' },
    { id: 'sewage', label: 'Sewage / solids-handling', note: 'Pumps that pass large solids (typically 2" or more).' },
    { id: 'grinder', label: 'Grinder pumps', note: 'Pumps that macerate solids, for pressure sewer service.' },
    { id: 'other', label: 'Other / uncategorized', note: '' }
  ];

  const GRAPH = ' Curve points were read from the published performance graph and are approximate. Verify against the manufacturer\'s current data.';
  const pump = o => Object.assign({ builtin: true }, o);

  // ---------------------------------------------------------------- Ashland Pump CPM Series
  const ASHLAND_CPM_SRC = 'Ashland Pump CPM Series cut sheet AP-0339 rev 07/2022.' + GRAPH;
  const cpm = (id, model, gpmClass, stages, pts) => pump({
    id, category: 'he-filtered',
    manufacturer: 'Ashland Pump', series: 'CPM Series', model,
    name: `Ashland ${model} (1/2 hp)`,
    hp: '1/2', solids: '1/8"',
    models: [
      { order: `${model}-115`, volts: '115/1', fla: 10 },
      { order: `${model}-230`, volts: '230/1', fla: 6 }
    ],
    desc: `${gpmClass} gpm class, ${stages}-stage, 1/2 hp, single phase. Bottom suction cistern/effluent pump for filtered effluent or gray water. Passes 1/8" solids.`,
    source: ASHLAND_CPM_SRC,
    pts
  });

  // ---------------------------------------------------------------- Liberty Pumps FL-Series
  const LIB_FL60_SRC = 'Liberty Pumps FL60/FLH60-Series 60 Hz pump specification, FL60/FLH60-60 R10/2024.' + GRAPH;
  const LIB_FL100_SRC = 'Liberty Pumps FL100-Series pump specification, FL100 R04/2025. Shutoff (90 ft) and 98 gpm @ 15 ft are from the specification text; other points were read from the published graph and are approximate. Verify against the manufacturer\'s current data.';
  const cords = 'Order-number suffix -2, -3, -5 = 25, 35, 50 ft cord (no suffix = 10 ft). "A" models have a piggyback float (automatic); "M" models are manual, for use with a control panel or timer.';

  const BUILTIN_PUMPS = [
    cpm('ashland-10cpm', '10CPM', '10', 7, [
      { Q: 0, H: 225 }, { Q: 2.5, H: 212 }, { Q: 5, H: 195 }, { Q: 7.5, H: 170 }, { Q: 10, H: 135 },
      { Q: 12.5, H: 95 }, { Q: 15, H: 47 }, { Q: 16.5, H: 20 }, { Q: 17.5, H: 0 }
    ]),
    cpm('ashland-20pcpm', '20+CPM', '20+', 6, [
      { Q: 0, H: 169 }, { Q: 5, H: 162 }, { Q: 10, H: 146 }, { Q: 15, H: 126 }, { Q: 20, H: 100 },
      { Q: 25, H: 66 }, { Q: 30, H: 24 }, { Q: 32.9, H: 0 }
    ]),
    cpm('ashland-20cpm', '20CPM', '20', 5, [
      { Q: 0, H: 140 }, { Q: 5, H: 133 }, { Q: 10, H: 123 }, { Q: 15, H: 106 }, { Q: 20, H: 86 },
      { Q: 25, H: 58 }, { Q: 30, H: 24 }, { Q: 34, H: 0 }
    ]),
    cpm('ashland-30cpm', '30CPM', '30', 4, [
      { Q: 0, H: 97 }, { Q: 5, H: 94 }, { Q: 10, H: 87 }, { Q: 15, H: 77 }, { Q: 20, H: 64 },
      { Q: 25, H: 47 }, { Q: 30, H: 24 }, { Q: 34.8, H: 0 }
    ]),

    pump({
      id: 'liberty-fl30', category: 'effluent',
      manufacturer: 'Liberty Pumps', series: 'FL30-Series', model: 'FL30',
      name: 'Liberty FL30 (1/3 hp)', hp: '1/3', solids: '3/4"',
      models: [
        { order: 'FL31A / FL31M', volts: '115/1', fla: 10.5 },
        { order: 'FL32A / FL32M', volts: '208–230/1', fla: 5.5 }
      ],
      desc: `Submersible effluent pump, multi-vane engineered polymer impeller, 1725 RPM, 1-1/2" NPT discharge. ${cords}`,
      source: 'Liberty Pumps FL30-Series pump specification, FL30 R09/2024. Shutoff (19.8 ft) is from the specification text. Note: the text lists 58 gpm @ 5 ft, but the published curve shows about 53 gpm @ 5 ft; the curve is used here.' + GRAPH,
      pts: [
        { Q: 0, H: 19.8 }, { Q: 10, H: 18.3 }, { Q: 20, H: 16.6 }, { Q: 30, H: 14.3 }, { Q: 35, H: 12.9 },
        { Q: 40, H: 11.3 }, { Q: 45, H: 9.4 }, { Q: 50, H: 7 }, { Q: 55, H: 3.4 }, { Q: 59, H: 0 }
      ]
    }),
    pump({
      id: 'liberty-fl50', category: 'effluent',
      manufacturer: 'Liberty Pumps', series: 'FL50-Series', model: 'FL50',
      name: 'Liberty FL50 (1/2 hp)', hp: '1/2', solids: '3/4"',
      models: [
        { order: 'FL51A / FL51M', volts: '115/1', fla: 12 },
        { order: 'FL52A / FL52M', volts: '208–230/1', fla: 6.5 }
      ],
      desc: `Submersible effluent pump, multi-vane cast iron impeller, 3450 RPM, 1-1/2" or 2" NPT discharge. ${cords}`,
      source: 'Liberty Pumps FL50-Series pump specification, FL50 R09/2024. Shutoff (55 ft) and 76 gpm @ 15 ft are from the specification text; other points were read from the published graph and are approximate. Verify against the manufacturer\'s current data.',
      pts: [
        { Q: 0, H: 55 }, { Q: 10, H: 52 }, { Q: 20, H: 48 }, { Q: 30, H: 43.5 }, { Q: 40, H: 38.5 },
        { Q: 50, H: 33 }, { Q: 60, H: 26 }, { Q: 70, H: 19 }, { Q: 76, H: 15 }, { Q: 80, H: 12 }, { Q: 90, H: 3.5 }, { Q: 93.5, H: 0 }
      ]
    }),
    pump({
      id: 'liberty-fl60', category: 'effluent',
      manufacturer: 'Liberty Pumps', series: 'FL60-Series', model: 'FL60',
      name: 'Liberty FL60 (6/10 hp)', hp: '6/10', solids: '3/4"',
      models: [
        { order: 'FL62A / FL62M', volts: '208–230/1', fla: 8.2 },
        { order: 'FL63M', volts: '208/230/3', fla: 5.6 },
        { order: 'FL64M', volts: '440–480/3', fla: 2.8 }
      ],
      desc: `Submersible effluent pump, semi-open multi-vane cast iron impeller, 3450 RPM, 1-1/2" or 2" NPT discharge. ${cords}`,
      source: LIB_FL60_SRC,
      pts: [
        { Q: 0, H: 65 }, { Q: 10, H: 63 }, { Q: 20, H: 59 }, { Q: 30, H: 54.5 }, { Q: 40, H: 50 },
        { Q: 50, H: 44 }, { Q: 60, H: 37 }, { Q: 70, H: 29.5 }, { Q: 80, H: 20 }, { Q: 90, H: 10 }, { Q: 98.5, H: 0 }
      ]
    }),
    pump({
      id: 'liberty-flh60', category: 'effluent',
      manufacturer: 'Liberty Pumps', series: 'FLH60-Series', model: 'FLH60',
      name: 'Liberty FLH60 (6/10 hp, 115 V)', hp: '6/10', solids: '3/4"',
      models: [
        { order: 'FLH61A / FLH61M', volts: '115/1', fla: 12 }
      ],
      desc: `Higher-head version of the FL60 with an enclosed multi-vane cast iron impeller, 3450 RPM, 1-1/2" or 2" NPT discharge. ${cords}`,
      source: LIB_FL60_SRC,
      pts: [
        { Q: 0, H: 70.5 }, { Q: 10, H: 68.5 }, { Q: 20, H: 65 }, { Q: 30, H: 60 }, { Q: 40, H: 54 },
        { Q: 50, H: 44.5 }, { Q: 55, H: 37 }, { Q: 60, H: 29.5 }, { Q: 65, H: 19 }, { Q: 70, H: 8 }, { Q: 73, H: 0 }
      ]
    }),
    pump({
      id: 'liberty-fl100', category: 'effluent',
      manufacturer: 'Liberty Pumps', series: 'FL100-Series', model: 'FL100',
      name: 'Liberty FL100 (1 hp)', hp: '1', solids: '3/4"',
      models: [
        { order: 'FL102A / FL102M', volts: '208–230/1', fla: 12 },
        { order: 'FL103M', volts: '208/230/3', fla: 9 },
        { order: 'FL104M', volts: '440–480/3', fla: 4.5 },
        { order: 'FL105M', volts: '575/3', fla: 3.3 }
      ],
      desc: `Submersible effluent pump, 2-vane cast iron impeller, 3450 RPM, 1-1/2" or 2" NPT discharge. ${cords}`,
      source: LIB_FL100_SRC,
      pts: [
        { Q: 0, H: 90 }, { Q: 10, H: 87 }, { Q: 20, H: 84 }, { Q: 30, H: 80 }, { Q: 40, H: 75 },
        { Q: 50, H: 70 }, { Q: 60, H: 61.5 }, { Q: 70, H: 52.5 }, { Q: 80, H: 42 }, { Q: 90, H: 30 }, { Q: 98, H: 15 }, { Q: 107, H: 0 }
      ]
    }),
    pump({
      id: 'liberty-fl150', category: 'effluent',
      manufacturer: 'Liberty Pumps', series: 'FL150-Series', model: 'FL150',
      name: 'Liberty FL150 high-head (1-1/2 hp)', hp: '1-1/2', solids: '3/4"',
      models: [
        { order: 'FL152A / FL152M', volts: '208–230/1', fla: 15 },
        { order: 'FL153M', volts: '208/230/3', fla: 11.4 },
        { order: 'FL154M', volts: '440–480/3', fla: 5.7 },
        { order: 'FL155M', volts: '575/3', fla: 4.9 }
      ],
      desc: `High-head submersible effluent pump, 2-vane semi-open cast iron impeller, 3450 RPM, 1-1/2" or 2" NPT discharge. Order-number suffix -2, -3, -5 = 25, 35, 50 ft cord. "A" models have a piggyback float (automatic); "M" models are manual, for use with a control panel or timer.`,
      source: 'Liberty Pumps FL150-Series pump specification, FL150 R04/2025. Shutoff (110 ft) and 123 gpm @ 10 ft are from the specification text; other points were read from the published graph and are approximate. Verify against the manufacturer\'s current data.',
      pts: [
        { Q: 0, H: 110 }, { Q: 10, H: 103.5 }, { Q: 20, H: 97 }, { Q: 30, H: 90 }, { Q: 40, H: 82 }, { Q: 50, H: 74.5 },
        { Q: 60, H: 67 }, { Q: 70, H: 60 }, { Q: 80, H: 53 }, { Q: 90, H: 46 }, { Q: 100, H: 39 }, { Q: 110, H: 29 },
        { Q: 120, H: 18 }, { Q: 123, H: 10 }, { Q: 129.5, H: 0 }
      ]
    }),
    pump({
      id: 'liberty-fl200', category: 'effluent',
      manufacturer: 'Liberty Pumps', series: 'FL200-Series', model: 'FL200',
      name: 'Liberty FL200 high-head (2 hp)', hp: '2', solids: '3/4"',
      models: [
        { order: 'FL202A / FL202M', volts: '208–230/1', fla: 15 },
        { order: 'FL203M', volts: '208/230/3', fla: 11.4 },
        { order: 'FL204M', volts: '440–480/3', fla: 5.7 },
        { order: 'FL205M', volts: '575/3', fla: 4.9 }
      ],
      desc: `High-head submersible effluent pump, 2-vane semi-open cast iron impeller, 3450 RPM, 1-1/2" or 2" NPT discharge. Order-number suffix -2, -3, -5 = 25, 35, 50 ft cord. "A" models have a piggyback float (automatic); "M" models are manual, for use with a control panel or timer.`,
      source: 'Liberty Pumps FL200-Series pump specification, FL200 R04/2025. Shutoff (127 ft) and 107 gpm @ 10 ft are from the specification text; other points were read from the published graph and are approximate. Verify against the manufacturer\'s current data.',
      pts: [
        { Q: 0, H: 127 }, { Q: 10, H: 121.5 }, { Q: 20, H: 116 }, { Q: 30, H: 110.5 }, { Q: 40, H: 105 }, { Q: 50, H: 99.5 },
        { Q: 60, H: 94 }, { Q: 70, H: 88 }, { Q: 80, H: 80.5 }, { Q: 90, H: 70 }, { Q: 100, H: 55 }, { Q: 102.5, H: 45 },
        { Q: 104.5, H: 30 }, { Q: 107, H: 10 }, { Q: 108.5, H: 0 }
      ]
    }),

    // ---------------------------------------------------------------- Barnes (Crane Pumps & Systems)
    pump({
      id: 'barnes-sp33', category: 'effluent',
      manufacturer: 'Barnes (Crane Pumps & Systems)', series: 'SP33 Series', model: 'SP33',
      name: 'Barnes SP33 (1/3 hp)', hp: '1/3', solids: 'Not stated on sheet (vortex impeller)',
      models: [
        { order: 'SP33', volts: '120/1', fla: 5.8, note: 'no level control' },
        { order: 'SP33A', volts: '120/1', fla: 5.8, note: 'wide-angle float' },
        { order: 'SP33VF', volts: '120/1', fla: 5.8, note: 'vertical float' },
        { order: 'SP33D', volts: '120/1', fla: 5.8, note: 'diaphragm switch' }
      ],
      desc: 'Submersible sump/effluent pump for rain water or light effluent. 10-vane vortex cast iron impeller, 3450 RPM (60 Hz), 1-1/2" NPT discharge. 60 Hz curve shown.',
      source: 'Barnes SP33 installation manual, Form No. 112251 Rev. P, curve V112547P (60 Hz).' + GRAPH,
      pts: [
        { Q: 0, H: 30.5 }, { Q: 5, H: 29 }, { Q: 10, H: 27 }, { Q: 15, H: 24.5 }, { Q: 20, H: 22 },
        { Q: 25, H: 19.5 }, { Q: 30, H: 16.5 }, { Q: 35, H: 13.8 }, { Q: 40, H: 11 }, { Q: 45, H: 8 }, { Q: 50, H: 5 }
      ]
    }),

    pump({
      id: 'liberty-le40', category: 'sewage',
      manufacturer: 'Liberty Pumps', series: 'LE40-Series', model: 'LE40',
      name: 'Liberty LE40 (4/10 hp)', hp: '4/10', solids: '2"',
      models: [
        { order: 'LE41A', volts: '115/1', fla: 12, note: 'wide-angle piggyback float' },
        { order: 'LE41AV', volts: '115/1', fla: 12, note: 'vertical switch' },
        { order: 'LE41M', volts: '115/1', fla: 12, note: 'manual (panel or timer)' }
      ],
      desc: 'Submersible sewage pump, vortex engineered polymer impeller, 1725 RPM, 2" NPT discharge. Order-number suffix -2 = 25 ft cord; LE41M-3 / -5 = 35 / 50 ft bare-lead cords.',
      source: 'Liberty Pumps LE40-Series pump specification, LE40 R12/2024. Shutoff (21 ft) and 125 gpm @ 5 ft are from the specification text; other points were read from the published graph and are approximate. Verify against the manufacturer\'s current data.',
      pts: [
        { Q: 0, H: 21 }, { Q: 20, H: 19 }, { Q: 40, H: 17.3 }, { Q: 60, H: 15.6 }, { Q: 70, H: 14.4 }, { Q: 80, H: 13 },
        { Q: 90, H: 11.6 }, { Q: 100, H: 10 }, { Q: 110, H: 8.2 }, { Q: 120, H: 6 }, { Q: 125, H: 5 }, { Q: 130, H: 3.4 },
        { Q: 140, H: 0.8 }, { Q: 142.3, H: 0 }
      ]
    }),

    // ---------------------------------------------------------------- Zoeller
    pump({
      id: 'zoeller-264', category: 'sewage',
      manufacturer: 'Zoeller', series: 'Waste-Mate Series', model: '264',
      name: 'Zoeller 264 Waste-Mate (4/10 hp)', hp: '4/10', solids: '2" spherical',
      models: [
        { order: 'M264', volts: '115/1', fla: 9.4, note: 'automatic, integral float' },
        { order: 'N264', volts: '115/1', fla: 9.4, note: 'non-automatic (panel or timer)' },
        { order: 'BN264', volts: '115/1', fla: 9.4, note: 'with piggyback float switch' },
        { order: 'D264', volts: '230/1', fla: 4.7, note: 'automatic, integral float' },
        { order: 'E264', volts: '230/1', fla: 4.7, note: 'non-automatic (panel or timer)' },
        { order: 'BE264', volts: '230/1', fla: 4.7, note: 'with piggyback float switch' }
      ],
      desc: 'Sewage/effluent or dewatering pump. Non-clogging vortex impeller, 1725 RPM, 2" NPT discharge. Use the non-automatic N264/E264 with a control panel or dosing timer.',
      source: 'Zoeller technical data sheet FM2788 (0222), Section 2.20.020. Points are from the published Total Dynamic Head/Flow table: shutoff 18 ft; 23 gpm @ 15 ft; 60 gpm @ 10 ft; 90 gpm @ 5 ft.',
      pts: [
        { Q: 0, H: 18 }, { Q: 23, H: 15 }, { Q: 60, H: 10 }, { Q: 90, H: 5 }
      ]
    })
  ];

  root.PumpData = { PUMP_CATEGORIES, BUILTIN_PUMPS };
})(typeof self !== 'undefined' ? self : this);
