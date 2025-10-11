// Centralized labels, effects, and type mapping
export const ACTION_LABELS = {
  'blunt-attack': 'Blunt Attack',
  'edged-attack': 'Edged Attack',
  'shooting': 'Shooting',
  'throwing-edged': 'Throwing Edged',
  'throwing-blunt': 'Throwing Blunt',
  'energy': 'Energy Attack',
  'force': 'Force Attack',
  'grappling': 'Grappling',
  'grabbing': 'Grabbing',
  'escaping': 'Escaping Hold',
  'charging': 'Charging',
  'dodging': 'Dodging',
  'evading': 'Evading',
  'blocking': 'Blocking',
  'catching': 'Catching',
  'stun': 'Stun Check',
  'slam': 'Slam Check',
  'kill': 'Kill Check'
};

export const ACTION_EFFECTS = {
  'blunt-attack':   { white:'Miss', green:'Hit', yellow:'Slam',    red:'Stun' },
  'edged-attack':   { white:'Miss', green:'Hit', yellow:'Stun',    red:'Kill' },
  'shooting':       { white:'Miss', green:'Hit', yellow:'Bullseye',red:'Kill' },
  'throwing-edged': { white:'Miss', green:'Hit', yellow:'Stun',    red:'Kill' },
  'throwing-blunt': { white:'Miss', green:'Hit', yellow:'Hit',     red:'Stun' },
  'energy':         { white:'Miss', green:'Hit', yellow:'Bullseye',red:'Kill' },
  'force':          { white:'Miss', green:'Hit', yellow:'Bullseye',red:'Stun' },
  'grappling':      { white:'Miss', green:'Miss',yellow:'Partial', red:'Hold' },
  'grabbing':       { white:'Miss', green:'Take',yellow:'Grab',    red:'Break' },
  'escaping':       { white:'Miss', green:'Escape',yellow:'Escape',red:'Reverse' },
  'charging':       { white:'Miss', green:'Hit', yellow:'Slam',    red:'Stun' },
  'dodging':        { white:'None', green:'-2 CS',yellow:'-4 CS',  red:'-6 CS' },
  'evading':        { white:'Auto-hit', green:'Evasion', yellow:'Evasion +1CS', red:'Evasion +2CS' },
  'blocking':       { white:'-6 CS',green:'-4 CS',yellow:'-2 CS',  red:'+1 CS' },
  'catching':       { white:'Autohit', green:'Miss', yellow:'Damage', red:'Catch' },
  'stun':           { white:'1-10 rounds', green:'1 round', yellow:'No effect', red:'No effect' },
  'slam':           { white:'Grand Slam',  green:'1 area', yellow:'Stagger',    red:'No Slam' },
  'kill':           { white:'Endurance Loss', green:'E/S', yellow:'No effect',  red:'No effect' }
};
