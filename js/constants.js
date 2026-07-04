// constants.js - shared model / display constants (units in mm unless noted)

// Unit conversion
export const MM_TO_M = 0.001;
export const MM2_TO_M2 = 1e-6;

// Model defaults
export const DEFAULT_SECTION_B_MM = 200;
export const DEFAULT_SECTION_H_MM = 400;
export const DEFAULT_STORY_HEIGHT_MM = 2800;
export const DEFAULT_RAFTER_SPACING_MM = 910;
export const DEFAULT_EAVE_DEPTH_MM = 600;
export const DEFAULT_ROOF_GROUP_ID = 'RG1';
// Default roof slope as rise/run ratio (0.3 = 3寸勾配相当, unitless)
export const DEFAULT_ROOF_SLOPE_RATIO = 0.3;
// Waist wall (腰壁): default top offset above the bottom level
export const WAIST_WALL_TOP_OFFSET_MM = 1200;
// Hanging wall (垂れ壁): default depth measured down from the story top
export const HANGING_WALL_DEPTH_MM = 600;

// Display
export const WALL_DISPLAY_OFFSET_MM = 120;

// Hit testing
export const HIT_TOLERANCE_MM = 300;
export const PICK_TOLERANCE_PX = 8;
export const WIDE_PICK_TOLERANCE_PX = 20;
