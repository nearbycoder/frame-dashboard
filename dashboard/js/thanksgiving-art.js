// Handcrafted Thanksgiving SVG illustrations (zero JS animation loops, WebView 106 & lite-mode safe).
(function () {
  'use strict';
  App.festiveArt = {
    // Proud Thanksgiving turkey wearing a pilgrim hat, flanked by a ribbed pumpkin, acorn & autumn leaves.
    heroTurkey: function () {
      return '<svg class="festive-hero-svg" width="218" height="152" viewBox="0 0 220 154" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        // Soft ground shadow
        '<ellipse cx="112" cy="145" rx="96" ry="7" fill="#3B2010" fill-opacity="0.18"/>' +
        // Golden wheat stalks peeking behind the pumpkin
        '<g stroke="#C98A1C" stroke-width="1.8" stroke-linecap="round">' +
          '<path d="M26 112Q18 90 12 72"/><path d="M32 108Q26 88 22 70"/>' +
        '</g>' +
        '<g fill="#E8AE30" stroke="#8C590C" stroke-width="1">' +
          '<ellipse cx="10" cy="70" rx="3" ry="6" transform="rotate(-24 10 70)"/>' +
          '<ellipse cx="16" cy="78" rx="3" ry="6" transform="rotate(14 16 78)"/>' +
          '<ellipse cx="14" cy="88" rx="3" ry="6" transform="rotate(-22 14 88)"/>' +
          '<ellipse cx="22" cy="68" rx="3" ry="6" transform="rotate(-12 22 68)"/>' +
          '<ellipse cx="27" cy="77" rx="3" ry="6" transform="rotate(20 27 77)"/>' +
        '</g>' +
        // Fan of 9 rich autumn tail feathers centered at (124, 98)
        '<g transform="rotate(-70 124 98)"><ellipse cx="124" cy="56" rx="12" ry="40" fill="#B62825" stroke="#5A1A14" stroke-width="2"/><ellipse cx="124" cy="32" rx="8" ry="12" fill="#F2B83B"/></g>' +
        '<g transform="rotate(-52 124 98)"><ellipse cx="124" cy="52" rx="12.5" ry="43" fill="#D9621C" stroke="#5A2810" stroke-width="2"/><ellipse cx="124" cy="26" rx="8.5" ry="13" fill="#FCE08B"/></g>' +
        '<g transform="rotate(-35 124 98)"><ellipse cx="124" cy="50" rx="12.5" ry="45" fill="#E6A126" stroke="#6B4410" stroke-width="2"/><ellipse cx="124" cy="23" rx="8" ry="13" fill="#B82B24"/></g>' +
        '<g transform="rotate(-17 124 98)"><ellipse cx="124" cy="48" rx="13" ry="46" fill="#5B7B36" stroke="#2D4218" stroke-width="2"/><ellipse cx="124" cy="21" rx="8.5" ry="13" fill="#F2B83B"/></g>' +
        '<g transform="rotate(0 124 98)"><ellipse cx="124" cy="47" rx="13" ry="47" fill="#C43422" stroke="#5A1A14" stroke-width="2"/><ellipse cx="124" cy="20" rx="8.5" ry="13" fill="#FCE08B"/></g>' +
        '<g transform="rotate(17 124 98)"><ellipse cx="124" cy="48" rx="13" ry="46" fill="#E6A126" stroke="#6B4410" stroke-width="2"/><ellipse cx="124" cy="21" rx="8.5" ry="13" fill="#C43422"/></g>' +
        '<g transform="rotate(35 124 98)"><ellipse cx="124" cy="50" rx="12.5" ry="45" fill="#5B7B36" stroke="#2D4218" stroke-width="2"/><ellipse cx="124" cy="23" rx="8" ry="13" fill="#FCE08B"/></g>' +
        '<g transform="rotate(52 124 98)"><ellipse cx="124" cy="52" rx="12.5" ry="43" fill="#D9621C" stroke="#5A2810" stroke-width="2"/><ellipse cx="124" cy="26" rx="8.5" ry="13" fill="#F2B83B"/></g>' +
        '<g transform="rotate(70 124 98)"><ellipse cx="124" cy="56" rx="12" ry="40" fill="#B62825" stroke="#5A1A14" stroke-width="2"/><ellipse cx="124" cy="32" rx="8" ry="12" fill="#E6A126"/></g>' +
        // Feet
        '<path d="M111 126v13m0 0l-8 4m8-4l0 5m0-5l7 4M137 126v13m0 0l-7 4m7-4l0 5m0-5l8 4" stroke="#E59226" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        // Plump turkey body & wings
        '<ellipse cx="92" cy="105" rx="12" ry="20" transform="rotate(18 92 105)" fill="#633316" stroke="#3D1E0C" stroke-width="2"/>' +
        '<ellipse cx="156" cy="105" rx="12" ry="20" transform="rotate(-18 156 105)" fill="#633316" stroke="#3D1E0C" stroke-width="2"/>' +
        '<ellipse cx="124" cy="103" rx="34" ry="30" fill="#82461F" stroke="#45220D" stroke-width="2.2"/>' +
        '<ellipse cx="124" cy="109" rx="23" ry="19" fill="#A56133"/>' +
        // Head & neck
        '<circle cx="124" cy="69" r="18.5" fill="#82461F" stroke="#45220D" stroke-width="2.2"/>' +
        // Cute eyes & rosy cheeks
        '<circle cx="116.5" cy="66" r="4.3" fill="#FFFDF8"/><circle cx="117.3" cy="66" r="2.2" fill="#1F120A"/><circle cx="118.2" cy="64.8" r="0.9" fill="#FFFFFF"/>' +
        '<circle cx="131.5" cy="66" r="4.3" fill="#FFFDF8"/><circle cx="130.7" cy="66" r="2.2" fill="#1F120A"/><circle cx="131.6" cy="64.8" r="0.9" fill="#FFFFFF"/>' +
        '<ellipse cx="110.5" cy="72.5" rx="3.4" ry="2.1" fill="#E36E59" fill-opacity="0.72"/>' +
        '<ellipse cx="137.5" cy="72.5" rx="3.4" ry="2.1" fill="#E36E59" fill-opacity="0.72"/>' +
        // Red wattle & golden beak
        '<path d="M126 73c5 1 7.5 6.5 5 11.5-2 3.8-7 2.8-7.5-1.5-.3-3 1.2-6 2.5-10z" fill="#CC2424" stroke="#701212" stroke-width="1.5"/>' +
        '<path d="M118.5 71.5h11L124 81z" fill="#F5AE2B" stroke="#7A4C0A" stroke-width="1.6" stroke-linejoin="round"/>' +
        // Jaunty pilgrim hat
        '<g transform="translate(124 49) rotate(-6)">' +
          '<path d="M-15 1l3-24h24l3 24z" fill="#2E221D" stroke="#18110E" stroke-width="2" stroke-linejoin="round"/>' +
          '<path d="M-13.8-6h27.6l.8 7h-29.2z" fill="#C44E19"/>' +
          '<rect x="-6.5" y="-7.5" width="13" height="10" rx="2" fill="none" stroke="#F4C446" stroke-width="2.6"/>' +
          '<ellipse cx="0" cy="2" rx="24" ry="5.5" fill="#2A1F1A" stroke="#18110E" stroke-width="2"/>' +
        '</g>' +
        // Plump ribbed pumpkin on the left
        '<g transform="translate(10 90)">' +
          '<path d="M35 12c1-7 5-11 10-12" stroke="#6B421E" stroke-width="4.5" stroke-linecap="round"/>' +
          '<path d="M37 10c-6-5-13-4-17 0 6 2 11 4 17 0z" fill="#5D8238" stroke="#2D4218" stroke-width="1.5"/>' +
          '<path d="M44 10c6-4 11-1 10 4-1 4-6 3-5-1" stroke="#5D8238" stroke-width="2" stroke-linecap="round"/>' +
          '<ellipse cx="22" cy="34" rx="17" ry="20" fill="#D45718" stroke="#6E2808" stroke-width="2"/>' +
          '<ellipse cx="50" cy="34" rx="17" ry="20" fill="#D45718" stroke="#6E2808" stroke-width="2"/>' +
          '<ellipse cx="36" cy="35" rx="16.5" ry="21.5" fill="#EC7224" stroke="#6E2808" stroke-width="2"/>' +
          '<path d="M32 18c-4 6-4 24 0 33" stroke="#F8A14B" stroke-width="2.6" stroke-linecap="round" stroke-opacity="0.7"/>' +
        '</g>' +
        // Autumn maple leaf + acorn on the right
        '<g transform="translate(168 109)">' +
          '<path d="M18 35l4-7" stroke="#691810" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M22 30l-3-9-11 3 5-8-9-6 10-2-2-9 9 6 6-9 2 10 10-1-7 8 7 6-10 2z" fill="#C93322" stroke="#691810" stroke-width="1.6" stroke-linejoin="round"/>' +
          '<g transform="translate(4 14) rotate(16)">' +
            '<path d="M12 2c6 0 10 5 10 12 0 6-5 11-10 12C7 25 2 20 2 14 2 7 6 2 12 2z" fill="#9E5E28" stroke="#4D290D" stroke-width="1.8"/>' +
            '<path d="M1 8c0-5 5-8 11-8s11 3 11 8c-4 2-18 2-22 0z" fill="#5C3416" stroke="#361C0A" stroke-width="1.8"/>' +
            '<path d="M12 0v-4" stroke="#4D290D" stroke-width="2.4" stroke-linecap="round"/>' +
          '</g>' +
        '</g>' +
      '</svg>';
    },

    // Cute colorful mini turkey badge for Ambient & Today pills.
    miniTurkey: function (size) {
      size = size || 24;
      return '<svg class="i festive-mini-turkey" width="' + size + '" height="' + size + '" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g transform="rotate(-55 16 19)"><ellipse cx="16" cy="10" rx="3.4" ry="9" fill="#C82825"/></g>' +
        '<g transform="rotate(-28 16 19)"><ellipse cx="16" cy="9" rx="3.5" ry="9.5" fill="#E57224"/></g>' +
        '<g transform="rotate(0 16 19)"><ellipse cx="16" cy="8.5" rx="3.6" ry="9.8" fill="#F0B536"/></g>' +
        '<g transform="rotate(28 16 19)"><ellipse cx="16" cy="9" rx="3.5" ry="9.5" fill="#5C8036"/></g>' +
        '<g transform="rotate(55 16 19)"><ellipse cx="16" cy="10" rx="3.4" ry="9" fill="#C82825"/></g>' +
        '<ellipse cx="16" cy="21" rx="8.5" ry="7.2" fill="#82461F" stroke="#45220D" stroke-width="1.4"/>' +
        '<circle cx="16" cy="13.5" r="4.8" fill="#82461F" stroke="#45220D" stroke-width="1.4"/>' +
        '<circle cx="14.2" cy="12.8" r="1" fill="#FFFDF8"/><circle cx="17.8" cy="12.8" r="1" fill="#FFFDF8"/>' +
        '<path d="M17.2 15.2c1.4.4 2 2 1 3.4-.7.9-2 .4-2-.8 0-1 .5-1.8 1-2.6z" fill="#D42828"/>' +
        '<path d="M14.3 14.5h3.4L16 17.5z" fill="#F5AE2B"/>' +
      '</svg>';
    },

    // Plump pumpkin + maple leaf (Chores card)
    pumpkinCluster: function () {
      return '<svg class="festive-card-art" width="84" height="70" viewBox="0 0 80 66" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M58 50l-2-7-9 2 4-7-7-4 8-2-2-7 7 5 5-7 2 8 8-1-5 7 5 5-8 2z" fill="#C93322" stroke="#6E1910" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M31 18c1-7 5-10 10-11" stroke="#6B421E" stroke-width="4.2" stroke-linecap="round"/>' +
        '<path d="M33 16c-6-5-13-4-17 0 6 2 11 4 17 0z" fill="#5D8238" stroke="#2D4218" stroke-width="1.5"/>' +
        '<ellipse cx="20" cy="40" rx="15" ry="18" fill="#D45718" stroke="#6E2808" stroke-width="2"/>' +
        '<ellipse cx="44" cy="40" rx="15" ry="18" fill="#D45718" stroke="#6E2808" stroke-width="2"/>' +
        '<ellipse cx="32" cy="41" rx="14.5" ry="19" fill="#EC7224" stroke="#6E2808" stroke-width="2"/>' +
        '<path d="M28 26c-3 5-3 21 0 29" stroke="#F8A14B" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.75"/>' +
      '</svg>';
    },

    // Slice of pumpkin pie with whipped cream (Shopping card)
    pumpkinPie: function () {
      return '<svg class="festive-card-art" width="86" height="70" viewBox="0 0 80 66" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<ellipse cx="40" cy="57" rx="34" ry="6" fill="#3B2010" fill-opacity="0.16"/>' +
        // Pie filling top triangle
        '<path d="M8 40L58 18c8 4 13 10 14 17L12 46z" fill="#DE6B20" stroke="#75310A" stroke-width="2" stroke-linejoin="round"/>' +
        // Side slice cut
        '<path d="M8 40l60-5v12L10 53z" fill="#C45616" stroke="#75310A" stroke-width="2" stroke-linejoin="round"/>' +
        // Flaky bottom crust
        '<path d="M8 50l60-6v6L10 56z" fill="#E3B169" stroke="#7A4C18" stroke-width="1.8" stroke-linejoin="round"/>' +
        // Crimped back crust
        '<path d="M56 17c5-2 10 0 12 4 3 1 5 4 5 8 2 3 1 7-3 9l-5 1c1-8-3-16-11-20z" fill="#E5B46C" stroke="#7A4C18" stroke-width="2" stroke-linejoin="round"/>' +
        // Dollop of whipped cream!
        '<path d="M36 29c-5 0-8-3-7-6 1-2 3-3 5-3 0-4 3-7 7-7 2 0 4 1 5 3 2-1 5 0 6 3 2 1 3 3 2 6-1 3-4 4-8 4z" fill="#FFFDF8" stroke="#B8A389" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<path d="M40 16c2-3 4-3 5-1" stroke="#FFFDF8" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>';
    },

    // Cozy autumn candle & holly/berries (Lights card)
    harvestCandle: function () {
      return '<svg class="festive-card-art" width="76" height="70" viewBox="0 0 72 66" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        // Warm glow halo
        '<circle cx="36" cy="18" r="15" fill="#F8C652" fill-opacity="0.32"/>' +
        // Flame
        '<path d="M36 5c4.5 6 6.5 10.5 6.5 14a6.5 6.5 0 0 1-13 0c0-3.5 2-8 6.5-14z" fill="#F59B23" stroke="#994E0B" stroke-width="1.6"/>' +
        '<path d="M36 11c2 3.2 3 5.5 3 7.5a3 3 0 0 1-6 0c0-2 1-4.3 3-7.5z" fill="#FFF0A8"/>' +
        // Candle pillar
        '<rect x="24" y="27" width="24" height="28" rx="4" fill="#FBF2DE" stroke="#8C6239" stroke-width="2"/>' +
        '<path d="M24 31c4 3 7-1 10 2s5-3 8 0 4-1 6-2v-2c0-1.5-1-2-3-2H27c-2 0-3 .5-3 2z" fill="#FFFDF8"/>' +
        // Brass holder + autumn leaves & berries at base
        '<path d="M15 55h42l-4 6H19z" fill="#C98A26" stroke="#6E460D" stroke-width="2" stroke-linejoin="round"/>' +
        '<ellipse cx="18" cy="52" rx="8" ry="4" transform="rotate(-20 18 52)" fill="#5D8238" stroke="#2D4218" stroke-width="1.4"/>' +
        '<ellipse cx="54" cy="52" rx="8" ry="4" transform="rotate(20 54 52)" fill="#D9621C" stroke="#6E2808" stroke-width="1.4"/>' +
        '<circle cx="24" cy="54" r="3.2" fill="#BD2828" stroke="#661414" stroke-width="1.2"/>' +
        '<circle cx="48" cy="54" r="3.2" fill="#BD2828" stroke="#661414" stroke-width="1.2"/>' +
      '</svg>';
    }
  };
})();
