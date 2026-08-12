export const defaultMarkerColors = {
    Hanger: '#ffffff',
    NavBeacon: '#ffffff',
    Rocket: '#ffffff',
    RefuelOutpost: '#aa232f',
    HeliosReserve: '#AB5024',
    Habitat: '#1C86E6',
    RockySpire: '#A67E3D',
    Maze: '#A67E3D',
    Ruin: '#000000',
    NDNS: '#555555',
    Cave: '#8A1CE6',
    SeedVault: '#1CE2E6',
    Lazarus: '#ffffff',
    OilRig: '#ffffff',
    SharkBay: '#E61CE6',
    StarChild: '#E61CE6',
    RollerFactory: '#E61CE6',
    GyroPlatform: '#ff9900',
    Silo: '#ff9900',
    StatueSpire: '#CCCCCC',
    Eden: '#ffffff',
    Lab: '#4eaad4'
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function getMarkerColor(type) {
    const storedColor = localStorage.getItem(`marker-color-${type}`);
    return storedColor && HEX_COLOR_PATTERN.test(storedColor)
        ? storedColor
        : defaultMarkerColors[type] || '#ffffff';
}
