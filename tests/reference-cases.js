/*
 * Reference cases: designs with a known answer from a source outside this calculator.
 *
 * The rest of the test suite checks that the calculator is internally consistent. These cases check it against
 * outside answers: hand calculations, other design software (for example PumpSelect), state design manuals,
 * manufacturer tools, and past sealed designs. Once a case is "active", any future change to the calculator that
 * moves its answer outside the tolerance fails the test suite.
 *
 * HOW TO ADD A CASE
 *  1. Set up the design in the calculator and click Export. Open the .tdh.json file in a text editor.
 *  2. Copy a block below and fill it in:
 *       id       short unique label, e.g. 'PS-03'
 *       title    what the design is
 *       source   where the expected answer comes from (document, page, program and version, project number)
 *       status   'pending' - the comparison is listed in the test results but does not fail the suite
 *                'active'  - the comparison must be within tolerance or the suite fails
 *       project  paste the whole exported .tdh.json contents here, OR
 *       inputs   only the values that differ from a new project (system type, lengths, pipe sizes, ...)
 *       expect   the outside answer. Any of:
 *                  Q, TDH          governing duty point (gpm, ft)
 *                  flushQ, flushTDH  drip flushing duty point (gpm, ft)
 *                  netDose         net dose (gal)
 *                Leave a value out (or null) if the source does not give it.
 *       tol      allowed difference for each value: { pct, abs }. A value passes if it is within EITHER the
 *                percentage or the absolute amount. Default: 3% or 0.5 (gpm, ft or gal).
 *       why      (optional) the explanation, when a known difference in method accounts for the difference
 *  3. Start as 'pending'. Open tests/run.html and read the comparison under "Reference cases".
 *     Explain any difference (K-values, C-factor, how the discharge assembly is counted, etc.) before making it
 *     'active'. Do not widen a tolerance to make a case pass without recording why.
 */
(function (root) {
  'use strict';

  root.REFERENCE_CASES = [
    {
      id: 'HC-01',
      title: 'Other device: 50 gpm through 100 ft of 2" Sch 40 PVC, no fittings',
      source: 'Hand calculation. Hazen-Williams, C = 150, ID 2.067 in: hf = 10.43 × 100 × 50^1.852 / (150^1.852 × 2.067^4.8704) = 3.969 ft. TDH = 10 ft static + 20 ft residual + 3.969 ft = 33.97 ft.',
      status: 'active',
      inputs: {
        systemType: 'other', lift: 10,
        other: { Q: 50, resid: 20, unit: 'ft' },
        transport: {
          discharge: { L: 0, fit: { e90: 0, e45: 0, teeRun: 0, teeBr: 0, valve: 0, check: 0, union: 0 }, kOther: 0 },
          before: { pipe: { cls: 'PVC Sch 40', nom: '2', id: '' }, L: 100, fit: { e90: 0, e45: 0, teeRun: 0, teeBr: 0, valve: 0, check: 0, union: 0 }, kOther: 0 }
        },
        addons: []
      },
      expect: { Q: 50, TDH: 33.97 },
      tol: { Q: { abs: 0.01 }, TDH: { abs: 0.05 } }
    },
    {
      id: 'HC-02',
      title: 'LPD: one 3/16" orifice at 5 ft residual head',
      source: 'Hand calculation. Orifice equation q = 19.64 × Cd × d² × √h = 19.64 × 0.60 × 0.1875² × √5 = 0.926 gpm. At this flow, pipe friction is under 0.01 ft, so TDH = 5 ft static + 5 ft residual = 10.0 ft.',
      status: 'active',
      inputs: {
        systemType: 'lpd', lift: 5,
        lpd: { nLat: 1, latLen: 5, orifice: '0.1875', spacing: 5, nOverride: 0, hEnd: 5, cd: 0.6, sides: 'one', manLen: 0, manFeed: 'end', latDz: 0, connDz: 0 },
        addons: []
      },
      expect: { Q: 0.926, TDH: 10.0 },
      tol: { Q: { abs: 0.002 }, TDH: { abs: 0.05 } }
    },
    {
      id: 'HC-03',
      title: 'Sewer main tie-in: 20 gpm against 20 psi through 100 ft of 2" Sch 40 PVC, no fittings',
      source: 'Hand calculation. Main pressure 20 psi × 2.307 = 46.14 ft. hf = 10.43 × 100 × 20^1.852 / (150^1.852 × 2.067^4.8704) = 0.727 ft. TDH = 5 + 46.14 + 0.727 = 51.87 ft (velocity head at the connection, 0.06 ft, is within the tolerance).',
      status: 'active',
      inputs: {
        systemType: 'discharge', lift: 5,
        discharge: { mode: 'main', Q: 20, pMax: 20, pMin: '' },
        transport: {
          discharge: { L: 0, fit: { e90: 0, e45: 0, teeRun: 0, teeBr: 0, valve: 0, check: 0, union: 0 }, kOther: 0 },
          before: { pipe: { cls: 'PVC Sch 40', nom: '2', id: '' }, L: 100, fit: { e90: 0, e45: 0, teeRun: 0, teeBr: 0, valve: 0, check: 0, union: 0 }, kOther: 0 }
        },
        addons: []
      },
      expect: { Q: 20, TDH: 51.87 },
      tol: { Q: { abs: 0.01 }, TDH: { abs: 0.1 } }
    }

    // ---- Template for a comparison with PumpSelect, a design manual, or a past design. Copy, fill in, and remove the //.
    // ,{
    //   id: 'PS-01',
    //   title: 'LPD, 6 laterals × 60 ft, 3/16" @ 5 ft, end-fed',
    //   source: 'Orenco PumpSelect v__, run __/__/____ by __; project file ____',
    //   status: 'pending',
    //   project: { /* paste the exported .tdh.json here */ },
    //   expect: { Q: 0, TDH: 0 },
    //   tol: { Q: { pct: 3 }, TDH: { pct: 5, abs: 1 } },
    //   why: ''
    // }
  ];
})(typeof self !== 'undefined' ? self : this);
