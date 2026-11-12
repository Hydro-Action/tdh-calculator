# Hydro-Action TDH & Flow Calculator

Pump sizing (design flow + total dynamic head) for wastewater dispersal systems, with a printable calculation report.

## Running it
Double-click `index.html`. It opens in your web browser and needs no installation or internet connection. Edge or Chrome is recommended.

## Tabs
- **Start**: recent projects, New / Open / Browse, project information, project type, and system type.
- **Parameters**: inputs on the left. The calculations, friction losses, cautions, TDH summary, pipe volumes, and dosing update as you type.
- **Chart**: system curve, pump curves from your library, operating points, and **Find Pumps** (GPM + TDH + % margin).
- **Report**: the calculation report. Click **Print / Save as PDF**.

## System types
| Type | Method |
|---|---|
| Low Pressure Distribution | Orifice-by-orifice step analysis of each lateral (q = 19.64·Cd·d²·√h), with the manifold solved so the most critical orifice gets the design residual head |
| Drip | PC (constant q) or non-PC (q = k·Pˣ) emitters, a dosing condition, and a field-flushing condition (flush velocity + return manifold/line losses). The pump must meet both points |
| Spray | Heads modeled as q = k·Pˣ from the rated flow and pressure |
| Non-pressurized | Pump to a distribution box or gravity system, with a known flow and residual head |
| Discharge: outfall or sewer main | **Open outfall:** head at the outlet = tailwater + exit loss (K·v²/2g). **Pressurized sewer main tie-in:** designed to the main's maximum pressure at the connection. It also checks the required pump shutoff head and, if a minimum pressure is entered, the pump runout point on a second system curve |
| Other device | Any device with a known flow and pressure requirement |

Friction is calculated with Hazen-Williams (default, C = 150 PVC) or Darcy-Weisbach. Fittings use K-values (editable under *Design settings*).
Indexing valve and supplemental device losses (flow meters, filters, regulators, etc.) are entered at a reference flow and scaled by (Q/Qref)².

## Saving
- **Save** (Ctrl+S) keeps the project in this browser's Recent Projects list.
- **Export** downloads a `.tdh.json` file. Open it later with **Browse…** on the Start tab.

## Pump library
Pumps are grouped by category on the Chart tab. The categories are high-head effluent (filtered), effluent, sewage/solids-handling, grinder, and other. **Find Pumps** can be limited to one category.

- **Built-in pumps** ship with the app in `js/pump-data.js` and are read-only. They come from the spec sheets in the `Pumps` folder. Currently included:
  - **High-head effluent (filtered):** Ashland CPM Series 10CPM, 20CPM, 20+CPM, 30CPM.
  - **Effluent:** Liberty FL30, FL50, FL60, FLH60, FL100, FL150 and FL200; Barnes SP33.
  - **Sewage / solids-handling:** Liberty LE40; Zoeller 264 Waste-Mate (M/N/BN/D/E/BE264).

  The Zoeller points come from its published flow/head table. The others were read from the published graphs and are approximate. Each pump's source note says which.
- **Your own pumps:** Chart → **Manage pump library…** → **+ New pump**, or use **Duplicate to edit** on a built-in pump. These are saved in the browser. Use **Export my pumps** / **Import…** to share them.
- To add a built-in pump, add an entry to `js/pump-data.js` with its category, manufacturer, hp, solids handling, order numbers, source document, and curve points.

## Branding
The colors (blue #1B75BC / #5697D1, green #006738 / #3B8E57, navy #0C222E) and fonts (Public Sans for headings, Source Sans for body text) match hydro-action.com.
The logo loads from `img/logo.svg` if that file exists. Otherwise it loads from hydro-action.com. With no internet connection, a text wordmark is shown, and the fonts fall back to Segoe UI.

## Input checks
Values that are valid but outside the usual range for onsite dispersal raise a **Check the input** caution in the results and the report. These catch typos and unit mix-ups, such as emitter spacing entered in feet instead of inches, emitter flow in gpm instead of gph, or a float drawdown height in feet. Nothing is blocked; if the value is correct, the caution can be ignored. The ranges are listed in `PLAUSIBLE` near the top of the checks in `js/calc.js` and should be reviewed by the engineer responsible for the tool.

## Versions
The version number and release date are set at the top of `js/calc.js` and printed in the app header, the report header, and the report footer, so a printed report can be traced to the calculator release that produced it. Exported project files record the version they were saved with. `CHANGELOG.md` lists each release and the release procedure.

## Tests
`tests/run.html` runs the automated test suite (`tests/tests.js`). It must be opened through a local web server, the same way the app is previewed. The suite covers:
- Every system type across a matrix of options (about 1,200 scenarios). Each result is compared with independent hand-calculation formulas, and the generated report is checked against the results: TDH table rows sum to the total, and the summary matches.
- Invalid inputs (each must give a clear error, not a crash) and inputs that must raise a caution.
- Input plausibility cautions: defaults raise none, and each unit mix-up case raises one.
- Engineering trend checks, such as longer pipe giving higher TDH, and textbook hand calculations.
- Pump library checks: curve shape, operating points, and drip/spray over-pressure.
- **Reference cases** (`tests/reference-cases.js`): designs with an answer from outside this calculator (hand calculations, PumpSelect, design manuals, manufacturer tools, past sealed designs). The test page shows each one as expected vs. calculated. A case starts as *pending* (listed, not enforced); once any difference is explained, set it to *active* so a later change that moves the answer fails the suite. Instructions are at the top of the file.

Run it after any change to the calculations, and before every release.

## Files
- `js/calc.js`: hydraulics engine (no UI code)
- `js/report.js`: report generator
- `js/chart.js`: SVG chart
- `js/app.js`: user interface
- `css/app.css`: styles, including print styles
- `tests/run.html`, `tests/tests.js`, `tests/reference-cases.js`: test suite and reference cases
- `CHANGELOG.md`: release history and release procedure
