# Changelog

Every report prints the calculator version that produced it. Each release below lists what changed and whether the change can move a calculated result (TDH, flow, dose volume, or a check).

## Release procedure
1. Make the change.
2. Open `tests/run.html` (served from the project folder). All checks must pass, including the active reference cases.
3. Change `VERSION` and `RELEASE_DATE` at the top of `js/calc.js`, and the `?v=` number on the CSS and script links in `index.html` to match (this makes browsers load the new files; the test suite fails if they differ):
   - patch (1.0.**x**): wording, layout or report formatting; no calculated value changes
   - minor (1.**x**.0): new inputs, system types, checks or pumps; existing results unchanged
   - major (**x**.0.0): a change that moves the result of an existing design (method, constant, default K-value or C-factor)
4. Add an entry below. For a major change, list which results move and by how much.
5. Commit, tag the commit with the version (`git tag v1.0.1`), and push (`git push --follow-tags`). GitHub Pages publishes the new version about a minute later.

## 1.0.0 (2026-11-12)
First numbered release.

- System types: low pressure distribution, drip (dosing and flushing), spray, non-pressurized (pump to gravity / distribution box), discharge to an outfall or pressurized sewer main, and other pressurized device.
- Friction by Hazen-Williams or Darcy-Weisbach; fittings by K-value; indexing valve and supplemental device losses scaled from a reference flow.
- Timed or demand dosing, pipe volumes, drainback, and pump run time.
- System curve, pump library (built-in pumps from the `Pumps` folder, plus user pumps), operating points, Find Pumps, and the drip/spray field-pressure check.
- Calculation report with schematic, equations, design checks, and notes.
- The report header and footer show the calculator version and release date. Exported project files record the version they were saved with; opening a file saved with a different version shows a message.
- Input plausibility cautions: values that are valid but outside the usual range (for example, emitter spacing entered in feet, emitter flow in gpm, a 500 ft static head) raise a "Check the input" caution. The ranges are in `PLAUSIBLE` in `js/calc.js`. Nothing is blocked.
- Reference-case tests (`tests/reference-cases.js`) for comparing results with outside answers. Three hand-calculation cases are active.
