# Three-row flow reading mode

Add an optional second presentation for the shared reader without changing its current chunk-at-a-time behavior or default. The implementation keeps the existing timeline and player responsible for reading position, pacing, stops and controls, while a flow-specific stage presents a rolling three-row window around a fixed crosshair in the middle row. A persistent Reading mode setting selects the presentation, and each host stores that preference independently.

The single implementation phase first adds contract and persistence tests, then the flow renderer and Settings control, and finishes with a real-browser scenario and documentation. The acceptance row is `reader-three-row-flow`; verify both modes, relevant structured-content cards, the centered focus marker, and the saved preference across browser and VS Code hosts.
