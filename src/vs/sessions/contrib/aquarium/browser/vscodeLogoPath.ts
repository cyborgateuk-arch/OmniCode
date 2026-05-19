/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// OmniCode logo silhouette used by the sessions aquarium.
// The aquarium cannot use the SVG asset directly because each fish renders the
// logo as live, same-document SVG geometry: fish.ts stores this path in a
// shared <symbol>, then renders clipped <use> slices with staggered CSS
// animations. That keeps the swimming-strip effect, currentColor species
// tinting, and auxiliary-window support while avoiding duplicate path parsing
// per fish.
export const VSCODE_LOGO_PATH = 'M60 48A26 26 0 1 0 8 48A26 26 0 1 0 60 48ZM51 48A17 17 0 1 1 17 48A17 17 0 1 1 51 48ZM34 12H96V84H34Z M88 48A26 26 0 1 0 36 48A26 26 0 1 0 88 48ZM79 48A17 17 0 1 1 45 48A17 17 0 1 1 79 48ZM0 12H62V84H0Z';
