// scripts/modules/actions/action-config.js
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
  'kill': 'Kill Check',
  "power-save": "Power Save",
  "save-nullify": "Power Save",
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
  'escaping':       { white:'Miss', green:'Miss',yellow:'Escape',red:'Reverse' },
  'charging':       { white:'Miss', green:'Hit', yellow:'Slam',    red:'Stun' },
  'dodging':        { white:'None', green:'-2 CS',yellow:'-4 CS',  red:'-6 CS' },
  'evading':        { white:'Auto-hit', green:'Evasion', yellow:'Evasion +1CS', red:'Evasion +2CS' },
  'blocking':       { white:'-6 CS',green:'-4 CS',yellow:'-2 CS',  red:'+1 CS' },
  'catching':       { white:'Autohit', green:'Miss', yellow:'Damage', red:'Catch' },
  'stun':           { white:'1-10 rounds', green:'1 round', yellow:'No effect', red:'No effect' },
  'slam':           { white:'Grand Slam',  green:'1 area', yellow:'Stagger',    red:'No Slam' },
  'kill':           { white:'Endurance Loss', green:'E/S', yellow:'No effect',  red:'No effect' },
  "save-nullify":   { white:  "Fail — affected", green:  "Success — resisted", yellow: "Success — resisted", red: "Success — resisted"},
  "power-save":     { white:  "Fail — affected", green:  "Success — resisted", yellow: "Success — resisted", red: "Success — resisted"}
};

// config/action-info.js
// config/action-config.js

export const ACTION_INFO = {
  "blunt-attack": {
    name: "Blunt Attack",
    ability: "Fighting",
    description: "Attack with bare hands, flat of a blade, or other blunt weapon.",
    effects: ["Miss", "Hit", "Slam", "Stun"],
      details: `<div style="line-height:1.6; font-size:13px;">
    <p>A Blunt Attack is an attack with bare hands, flat of a blade, or other blunt weapon. This replaces the Slugfest column in the Original Set. A character making a blunt attack may score a hit, slam, or stun result. A hero using blunt attack may always choose to inflict less damage than maximum. A hero may choose to pull his punch, doing less than full damage, or inflict a lesser color result (yellow instead of red).</p>
    
    <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
      <div style="font-weight:bold;color:#333;">Miss (White)</div>
      <div style="font-size:.9em;">Inflicts no damage. He has missed the target and normally will not have any further effect (also see Luring).</div>
    </div>
    
    <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
      <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
      <div style="font-size:.9em;">Inflicts her Strength rank number in damage to the opponent.</div>
    </div>
    
    <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
      <div style="font-weight:bold;color:#f57f17;">Slam (Yellow)</div>
      <div style="font-size:.9em;">Inflicts her Strength rank number in damage, and may in addition Slam the opponent.</div>
    </div>
    
    <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
      <div style="font-weight:bold;color:#c62828;">Stun (Red)</div>
      <div style="font-size:.9em;">Inflicts his Strength rank number in damage, and may in addition Stun his opponent.</div>
    </div>
    
    <p style="margin-top:10px;">A character using bare hands (or gauntlets, etc.) inflicts his Strength rank number in damage. A character using a blunt weapon inflicts up to that item's material strength; if the material strength of the item is greater than the Strength rank of the user, the user's Strength rank is increased to the lowest value of the next rank for damage.</p>
    
    <p style="font-style:italic;background:#f5f5f5;padding:8px;border-radius:4px;margin-top:8px;">
      <strong>Example:</strong> Aunt May (Feeble Strength) uses a lead pipe (Excellent material) in the drawing room on Col. Mustard. Aunt May would inflict two points damage normally, but inflicts three points (minimum damage of next higher rank) instead. Daredevil (Good Strength) using the same lead pipe would inflict 16 points damage (minimum damage of next higher rank), and the Thing (Monstrous Strength) would inflict Excellent damage (20 points). (That is why Ben Grimm does not normally use lead pipes in combat -- when he uses a blunt weapon, its purpose is usually to reach a non-adjacent target, and he has a preference for lightpoles.)
    </p>
  </div>`
  },
  
  "edged-attack": {
    name: "Edged Attack",
    ability: "Fighting",
    description: "Attack with claws, teeth, or edged weapons.",
    effects: ["Miss", "Hit", "Stun", "Kill"],
    details: `<div style="line-height:1.6; font-size:13px;">
        <p>Edged Attack is an attack with claws, teeth, or edged weapons such as knives, swords, or hatchets. This is the renamed version of the Hack 'N Slash column of the Original Set. A character making an edged attack may score a Hit, Stun, or Kill result. An edged attack will always inflict a minimum of the damage listed for that weapon. A character who can normally inflict higher damage may inflict damage equal to his Strength or the material strength of the weapon, whichever is less. Such damage may not be reduced in effect.</p>
        
        <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
          <div style="font-weight:bold;color:#333;">Miss (White)</div>
          <div style="font-size:.9em;">No damage inflicted.</div>
        </div>
        
        <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
          <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
          <div style="font-size:.9em;">Inflicts damage as set for that particular edged attack (click here to see info about Weapons).</div>
        </div>
        
        <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
          <div style="font-weight:bold;color:#f57f17;">Stun (Yellow)</div>
          <div style="font-size:.9em;">May inflict damage as set for that weapon or attack form, and may in addition Stun his opponent.</div>
        </div>
        
        <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
          <div style="font-weight:bold;color:#c62828;">Kill (Red) ⚠</div>
          <div style="font-size:.9em;">Inflicts damage as set for that weapon, and may in addition Kill his opponent. <strong>Heroes who kill lose ALL Karma!</strong></div>
        </div>
      </div>`
  },

  "shooting": {
    name: "Shooting",
    ability: "Agility",
    description: "Ranged attack using projectile weapons.",
    effects: ["Miss", "Hit", "Bullseye", "Kill"],
    details: `<div style="line-height:1.6; font-size:13px;">
    <p>A Shooting Attack is the most "normal" form of ranged attack, and consists of using a projectile weapon like a handgun, rifle, or other implement of destruction that is all too common in the USA. A character making a shooting attack may score a Miss, Hit, Bullseye, or Kill result. A Shooting Attack may never be reduced by the attacker in effect or damage.</p>
    
    <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
      <div style="font-weight:bold;color:#333;">Miss (White)</div>
      <div style="font-size:.9em;">Misses the intended target. The missile continues to fly, and the Judge may, if he deems circumstances warrant it, make a second roll to see if the attack hits another target in the same general area and path of the weapon (this is why shooting into a crowd or a gasoline storage shed is known as "a bad idea").</div>
    </div>
    
    <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
      <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
      <div style="font-size:.9em;">Will inflict damage according to the weapon. Some specialized weapons inflict no damage, but instead call for an Endurance FEAT (Mercy Bullets).</div>
    </div>
    
    <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
      <div style="font-weight:bold;color:#f57f17;">Bullseye (Yellow)</div>
      <div style="font-size:.9em;">Does damage as for a normal Hit result. A Bullseye is used if the character is shooting for a particular part of the target (the opponent's shooting hand, for example, in order to disarm him). The nature and result of a Bullseye is left to the Judge, but it should be required for targets of less than one foot square and should never be fatal.</div>
    </div>
    
    <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
      <div style="font-weight:bold;color:#c62828;">Kill (Red) ⚠</div>
      <div style="font-size:.9em;">May kill his or her opponent. Check on the Kill result table. Note that there is a greater chance of killing with a shooting, edged weapon, or energy attack than for any other type. <strong>Heroes who kill lose ALL Karma!</strong></div>
    </div>
  </div>`
  },
  
  "throwing-edged": {
    name: "Throwing Edged",
    ability: "Agility",
    description: "Throwing sharp, edged weapons.",
    effects: ["Miss", "Hit", "Stun", "Kill"],
      details: `<div style="line-height:1.6; font-size:13px;">
        <p>An Edged Throwing Attack involves throwing a sharp, edged weapon such as a knife or shuriken at the target. A character making this attack may score a Miss, Hit, Stun, or Kill result. An edged throwing attack may never be reduced in effect (from red to yellow, for example), but a player may inflict less damage.</p>
        
        <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
          <div style="font-weight:bold;color:#333;">Miss (White)</div>
          <div style="font-size:.9em;">Misses the intended target. The missile may hit another target as noted for Shooting.</div>
        </div>
        
        <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
          <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
          <div style="font-size:.9em;">Will inflict damage as for the listed weapon.</div>
        </div>
        
        <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
          <div style="font-weight:bold;color:#f57f17;">Stun (Yellow)</div>
          <div style="font-size:.9em;">Will inflict damage, and in addition have a possibility of Stunning the opponent for 1-10 rounds.</div>
        </div>
        
        <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
          <div style="font-weight:bold;color:#c62828;">Kill (Red) ⚠</div>
          <div style="font-size:.9em;">May potentially kill his opponent. <strong>Heroes who kill lose ALL Karma!</strong></div>
        </div>
      </div>`
  },
  
  "throwing-blunt": {
    name: "Throwing Blunt",
    ability: "Agility",
    description: "Throwing blunt objects.",
    effects: ["Miss", "Hit", "Stun"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>A Blunt Throwing Attack involves throwing a dull, blunt weapon such as a rock, bus, or large, concave disk at the opponent. A character may score a Miss, Hit, Bullseye, or Stun result. These are as described in the sections above. A blunt thrown weapon inflicts damage equal to the Strength of the thrower, or the material strength of the thrown item, whichever is less. A blunt thrown weapon can be reduced in effect or damage.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Miss (White)</div>
        <div style="font-size:.9em;">Missed target. See Shooting for missed projectiles.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
        <div style="font-size:.9em;">Inflicts damage equal to the Strength of the thrower, or the material strength of the thrown item, whichever is less.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Hit (Yellow)</div>
        <div style="font-size:.9em;">Inflicts damage equal to the Strength of the thrower, or the material strength of the thrown item, whichever is less.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Stun (Red)</div>
        <div style="font-size:.9em;">Inflicts damage and may Stun opponent.</div>
      </div>
    </div>`
  },
  
  "energy": {
    name: "Energy Attack",
    ability: "Agility",
    description: "Powers that use energy to damage the target.",
    effects: ["Miss", "Hit", "Bullseye", "Kill"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>An Energy Attack involves those Powers that use energy to shock or damage the target as well as weapons that simulate those abilities, and include fire blast, lightning bolts, and most forms of radiation. Energy Powers have no physical component. A character using an energy attack may score a Miss, Hit, Bullseye, or Kill result. These are described in the sections above. All forms of energy attack have a maximum damage. A player may reduce the damage inflicted by an energy attack, but not the effect (from red to yellow, for example).</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Miss (White)</div>
        <div style="font-size:.9em;">No damage. Attack missed.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
        <div style="font-size:.9em;">Inflicts standard damage for this power/weapon.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Bullseye (Yellow)</div>
        <div style="font-size:.9em;">As described in Shooting section.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Kill (Red) ⚠</div>
        <div style="font-size:.9em;">May kill opponent (check Kill result table). Greater chance of killing with energy attacks. <strong>Heroes who kill lose ALL Karma!</strong></div>
      </div>
    </div>`
  },
  
  "force": {
    name: "Force Attack",
    ability: "Agility",
    description: "Powers using physical manifestation of energy.",
    effects: ["Miss", "Hit", "Bullseye", "Stun"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>A Force Attack involves those Powers that use a physical manifestation of energy to inflict damage, and include the plasma-jetting repulsors used by Iron Man, some forms of radiation, the Invisible Woman's force fields, and Iceman's battering ram. A character using a force attack may score a Miss, Hit, Bullseye, or Stun result, as explained above or in the sections following. A character may choose to inflict less damage with a force attack than maximum, but may not reduce the effects (from red to yellow, for example).</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Miss (White)</div>
        <div style="font-size:.9em;">No damage. Attack missed.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
        <div style="font-size:.9em;">Inflicts standard damage for this power.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Bullseye (Yellow)</div>
        <div style="font-size:.9em;">As described in Shooting section.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Stun (Red)</div>
        <div style="font-size:.9em;">Inflicts damage AND may Stun opponent.</div>
      </div>
    </div>`
  },
  
  "grappling": {
    name: "Grappling",
    ability: "Strength",
    description: "Attempt to restrain or hold an opponent.",
    effects: ["Miss", "Partial Hold", "Full Hold"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>A Grappling Attack is an attack designed to limit the movement abilities of the opponent. A Grappling attack may score a Miss, Partial Hold, or Hold result.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Miss (White/Green)</div>
        <div style="font-size:.9em;">The attacker has failed to hold onto the opponent. The attacker may not make other attacks this round.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Partial Hold (Yellow)</div>
        <div style="font-size:.9em;">The attacker has grabbed onto an arm, leg, or other part in such a way that will limit actions but not reduce them in full. The attacker may choose exactly what she has grabbed onto. The target may perform any normal actions, but at a -2 CS penalty, and may not move if the attacker's Strength is equal to or greater than the target's. No damage is inflicted in a Partial Hold.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Full Hold (Red)</div>
        <div style="font-size:.9em;">The attacker has placed the target in a position where the target is fully restrained from action, and may damage the target. The target is considered held until the attacker releases the target or the target escapes. The attacker may perform one action in addition to maintaining the hold, and may inflict up to the Strength level of damage to the target (subject to Body Armor).</div>
      </div>
    </div>`
  },

  "grabbing": {
    name: "Grabbing",
    ability: "Strength",
    description: "Attempt to take an item from opponent.",
    effects: ["Miss", "Take", "Grab", "Break"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>A Grabbing Attack is an attack geared at taking a possession away from an opponent, like a gun, bomb, or Maltese Falcon. A character making a Grabbing attack may score a Miss, Take, Grab, or Break result. These results may have differing effects depending on the relative Strengths of the combatants. Grabbing combat normally does not inflict damage.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Miss (White)</div>
        <div style="font-size:.9em;">The item in question is not in your character's possession. If the item was in another character's possession, it still is. If the item was in no one's possession, the item is knocked loose and will be up to one area away in any direction.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">Take (Green)</div>
        <div style="font-size:.9em;">The attacker has full possession of the item if his Strength is equal to or greater than the target's (use material strength for things that are glued or clamped down). If not, consider as a miss.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Grab (Yellow)</div>
        <div style="font-size:.9em;">The attacker has taken possession of the item, whether or not the Strength of the opponent was higher.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Break (Red)</div>
        <div style="font-size:.9em;">The attacker has succeeded, and may either depart with the item immediately or, potentially, set off the item. A second roll is made against the material strength of the item involved. If a color (red, green or yellow) result is made, then the attacker may either use the item or move up to half his or her speed away (round up). If a white result is made, the item is damaged, broken, or goes off. This will vary from item to item -- a glass vase drops to the floor, a gun fires in a random direction, a bomb explodes or loses its safety device, etc.</div>
      </div>
    </div>`
  },

  "escaping": {
    name: "Escaping",
    ability: "Strength",
    description: "Attempt to escape from a hold.",
    effects: ["Miss", "Escape", "Reverse"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>Escaping is an action used by individuals placed in a hold to slip free of the opponent and possibly reverse the damage. A character making an escape may Miss, Escape, or Reverse the Hold.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Miss (White/Green)</div>
        <div style="font-size:.9em;">May make no other action that turn, and is considered held.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Escape (Yellow)</div>
        <div style="font-size:.9em;">Free of the hold. The character may move at half speed, but may not perform any other actions.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Reverse (Red)</div>
        <div style="font-size:.9em;">Free of the hold and in a position to do one of the following: Move up to half distance, attempt to Grapple the former attacker, or perform any other action at a -2 CS.</div>
      </div>
    </div>`
  },

  "charging": {
    name: "Charging",
    ability: "Endurance",
    description: "Full movement attack combining speed and impact.",
    effects: ["Miss", "Hit", "Slam", "Stun"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>Charging combat is a form of attack that combines movement and combat. Whereas making any other attack or action halves movement, a charging character may make his full movement and still strike. Charging is a favored method for heroes trying to close the distance between themselves and an opponent with a range weapon, and certain individuals such as Rhino, Juggernaut, and Bulldozer make this their preferred form of attack.</p>
      
      <p>A character must move at least one area to make a charging attack, but may move his entire movement rate to reach the combat. For each area the character moves through before reaching combat, the attacker gets a +1 CS, up to a maximum of +3 CS (Endurance for figuring this may not be raised beyond Shift Z in any event).</p>
      
      <p>Charging attacks are resolved on the Universal Table, checking under the Charging column of the Effects Table. The character making a charging attack may score a Miss, Hit, Slam, or Stun.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Miss (White)</div>
        <div style="font-size:.9em;">Inflicts no damage. In addition, the character continues his move for half the character's speed (round up) after the attack. Any change in direction would require an additional Agility FEAT. If the straight line passes into some material obstacle, the character makes an attack on that obstacle instead. The attacked character may return the attack only if his action was originally following the charge.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">Hit (Green)</div>
        <div style="font-size:.9em;">Inflicts up to his maximum current Endurance or his Body Armor rank in damage, whichever is higher, plus two additional points of damage for every area covered in the attack. (A character moving 10 areas with an Endurance of Good (10) hits an unarmored opponent at top speed, inflicts 10 + 2x10 = 30 points of damage.)</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Slam (Yellow)</div>
        <div style="font-size:.9em;">Inflicts damage as for a hit, and in addition may Slam an opponent.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Stun (Red)</div>
        <div style="font-size:.9em;">Inflicts damage as for a hit, and in addition may Stun the opponent. The attacker may inflict up to his Endurance or Body Armor in damage, but additional damage from speed is fixed. The attacker may also choose a lesser effect than that rolled.</div>
      </div>
      
      <p style="margin-top:10px;">Body Armor may influence the damage of a charge attack. If the defender's Body Armor is greater than the damage inflicted by the attacker, the damage is rebounded onto the attacker. If the attacker's Body Armor is greater than the rebounded damage, neither side takes damage. (Stuns and Slams still apply.)</p>
      
      <p style="font-style:italic;background:#f5f5f5;padding:8px;border-radius:4px;margin-top:8px;">
        <strong>Example:</strong> The character making the attack above has Good Body Armor, and makes the attack at 10 speed with Good Endurance on an opponent with Excellent Body Armor. The first 20 points of that are covered by the target's Body Armor, and as such are returned to the user. The attacker takes 20 points, 10 of which are absorbed by his own body armor. The attacker therefore takes 10 points from his own attack.
      </p>
      
      <p>Charging inanimate objects is handled in a similar manner, with the item's material strength counted as Body Armor. Charging through a Good strength wall will inflict 10 points of damage on the attacker, unless that damage is absorbed by Body Armor. This applies to characters who are slammed through walls, charge past a target into a wall, or fail to pull out of a dive.</p>
    </div>`
  },

  "dodging": {
    name: "Dodging",
    ability: "Agility",
    description: "Reduce incoming attack column shifts.",
    effects: ["No Shift", "-2 CS", "-4 CS", "-6 CS"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>Dodging is an Agility Ability, and reduces the attacking column shift. A character who is Dodging may move only half his speed in any turn, may not engage in a charging attack, and may perform only one other action that turn, maximum (including making an attack).</p>
      
      <p>A character who is Dodging makes an Agility FEAT at the start of the turn, as soon as Initiative is determined. That FEAT will determine the reduced effect of attacks on the character. The result may be no shift, a -2, -4, or -6CS shift on any attacks stated in the first part of the round. This means that the character may only dodge attacks of which he is aware. A character may not dodge an unexpected attack, such as a sniper who suddenly appears, an ally who makes an attack, or someone behind the character. (Blindsiding)</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">None (White)</div>
        <div style="font-size:.9em;">No column shift reduction. Attacks proceed normally.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">-2 CS (Green)</div>
        <div style="font-size:.9em;">Attacks against you this round suffer a -2 column shift penalty.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">-4 CS (Yellow)</div>
        <div style="font-size:.9em;">Attacks against you this round suffer a -4 column shift penalty.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">-6 CS (Red)</div>
        <div style="font-size:.9em;">Attacks against you this round suffer a -6 column shift penalty.</div>
      </div>
      
      <p style="margin-top:10px;">Powers may modify this rule, the most notable being the Spider-Sense possessed by the Amazing Spider-Man.</p>
      
      <p>In any event, a character who is making a Dodging attack makes any FEAT rolls in that turn at a -2 CS penalty.</p>
      
      <p>Dodging is usually used against ranged attacks and charging attacks. It has no effect against Slugfest and wrestling attacks (though the character may dodge to avoid ranged attacks in conjunction with adjacent attacks -- this has no effect on those adjacent other than to penalize the dodging character).</p>
    </div>`
  },

  "evading": {
    name: "Evading",
    ability: "Fighting",
    description: "Defensive tactic against adjacent attackers.",
    effects: ["Auto-Hit", "Evasion", "Evasion +1CS", "Evasion +2CS"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>Evading is a Fighting FEAT that is used by characters who are playing for time, looking for a weak spot in the opponent's attack and hoping to avoid getting their bodies splattered over the countryside.</p>
      
      <p>Evading is an effective defensive tactic only against adjacent attackers, such as those engaged in Slugfest or wrestling combat. Only a single opponent may be Evaded.</p>
      
      <p>A character who chooses to Evade announces that intention during the declaration phase of the turn. If both sides are evading, no actual combat occurs – both opponents are engaged in a flurry of feints and parries and no real blows are landed.</p>
      
      <p>The Evading character makes no attacks that round, but rolls on the Universal Table and checks the Evasion column in the Effects Table. The results are Auto-Hit, Evasion, Evasion +1, and Evasion +2.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Auto-Hit (White)</div>
        <div style="font-size:.9em;">The character zigged where he should have zagged, placing him in the direct line of fire of the opponent. The result of the opponent's attack will be at least a green result, even if a white result was rolled (it is still possible to be missed by a wrestling hold in this fashion, but Slugfest will always hit).</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">Evasion (Green)</div>
        <div style="font-size:.9em;">The character dodged the blow from that particular attacker. The attacker does no damage.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Evasion +1CS (Yellow)</div>
        <div style="font-size:.9em;">The character dodged the blow as in the Evasion result, and also put himself in the position to deal a better-placed blow against the foe. In the next round, an attack made by the character against that attacker will receive a +1CS bonus to hit (but not damage). This applies to only the first attack in that next round on that attacker, and may not be saved from round to round or increased.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Evasion +2CS (Red)</div>
        <div style="font-size:.9em;">The character dodged the blow as in the Evasion result, and also put himself in the position to deal a better-placed blow against the foe. In the next round, an attack made by the character against that attacker will receive a +2CS bonus to hit (but not damage). This applies to only the first attack in that next round on that attacker, and may not be saved from round to round or increased.</div>
      </div>
    </div>`
  },

  "blocking": {
    name: "Blocking",
    ability: "Strength",
    description: "Use Strength as temporary Body Armor.",
    effects: ["-6 CS", "-4 CS", "-2 CS", "+1 CS"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>Block is a defensive ability that uses the Strength ability to lessen the damage of physical attacks, which include Grappling, Slugfest, Edged and Blunt Throwing attacks, Force attacks (but not Shooting and Energy attacks) and Wrestling (but not Charging).</p>
      
      <p>The Block move is an attempt to meet force with force, and use the individual's Strength as a form of Body Armor against a specific attack. The character using a block may take no other action, but may shield others behind him. Normal Body Armor, but not Force Fields, still apply to defense.</p>
      
      <p>The character using the block maneuver does not attack but counts his Strength as Body Armor, provided the force can be physically resisted (use common sense here -- a fire cannot be blocked, but a pillar of ice can). Roll on the Universal Table against Strength to determine the effects. The notation -6CS, -4 CS, -2 CS, and +1CS indicates the level of Body Armor gained taken from the Strength of the character.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">-6 CS (White)</div>
        <div style="font-size:.9em;">Your Strength acts as Body Armor reduced by 6 column shifts.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">-4 CS (Green)</div>
        <div style="font-size:.9em;">Your Strength acts as Body Armor reduced by 4 column shifts.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">-2 CS (Yellow)</div>
        <div style="font-size:.9em;">Your Strength acts as Body Armor reduced by 2 column shifts.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">+1 CS (Red)</div>
        <div style="font-size:.9em;">Your Strength acts as Body Armor increased by 1 column shift.</div>
      </div>
      
      <p style="font-style:italic;background:#f5f5f5;padding:8px;border-radius:4px;margin-top:8px;">
        <strong>Example:</strong> A character with an Amazing Strength wishes to block a punch thrown by an opponent with Monstrous Strength (Fighting ability is used to hit, but Block has no effect on this). The character gets a green FEAT, -4 CS, which provides him with equivalent Body Armor of Good. The character takes 65 points damage. If the hero had made a red FEAT roll, the character would have totally blocked the attack (Monstrous Body Armor against Monstrous damage attack).
      </p>
    </div>`
  },

  "catching": {
    name: "Catching",
    ability: "Agility",
    description: "Catch falling objects, teammates, or projectiles.",
    effects: ["Auto-Hit", "Miss", "Damage", "Catch"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>The Catching maneuver is a move designed to let the hero catch falling objects and teammates, as well as catch objects that are thrown and fired at them. It uses the Agility ability to make this maneuver.</p>
      
      <p>The catching maneuver can only be directed against one item at a time. The attempt to catch the item is made on the Universal Table, with Auto-hit, Miss, Damage, and Catch results.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Auto-Hit (White)</div>
        <div style="font-size:.9em;">The object the hero tried to catch hit the hero instead. In the case of a falling object, this is as if the object made a charging attack against the character at the speed of the fall. In the cases of shooting or thrown weapons, the hero is automatically hit (a white result to hit is treated as a green result).</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">Miss (Green)</div>
        <div style="font-size:.9em;">The hero has missed catching the object. If the object he was trying to catch was directed against him as an attack, the attack proceeds at a +1CS to hit.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Damage (Yellow)</div>
        <div style="font-size:.9em;">The hero caught the object, but might damage it as a result. Treat the catch as a damage-inflicting attack on the object or character being caught.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">Catch (Red)</div>
        <div style="font-size:.9em;">The object is caught with no ill effects to the hero attempting the catch or the object or character being caught.</div>
      </div>
      
      <p style="margin-top:10px;">A character suffers -3CS on all attempts to catch objects directed against the character specifically. In addition, certain types of catches require a minimum Agility.</p>
      
      <ul style="margin:10px 0;">
        <li style="margin-bottom:6px;">Hero must have an Unearthly Agility to catch small, fast-moving items (like bullets).</li>
        <li style="margin-bottom:6px;">Hero must have an Amazing Agility to catch large, thin, projectiles (like arrows).</li>
        <li style="margin-bottom:6px;">Hero must have at least Remarkable Agility to attempt to catch other thrown projectiles.</li>
        <li style="margin-bottom:6px;">Hero may have any Agility to try to catch a falling character or object.</li>
      </ul>
    </div>`
  },

  "stun": {
    name: "Stun Check",
    ability: "Endurance",
    description: "Resist being stunned or knocked unconscious.",
    effects: ["1-10 Rounds", "1 Round", "No Effect"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>The Stun result has the potential of taking a hero out of the fight for a number of rounds. A character may be stunned as result of any Slugfest attack, Throwing attack, Force attack, and Charging attack. The target rolls an Endurance FEAT on the Universal Table, and checks the result on the Effects Table. There are three types of Stun results.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">1-10 Rounds (White)</div>
        <div style="font-size:.9em;">The character is knocked out for 1-10 rounds (roll a die). During this time a character may take no actions.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">1 Round (Green)</div>
        <div style="font-size:.9em;">The character is knocked down and may take no action next round. The character is still conscious, but as the apparent result is the same as 1-10 rounds, a character can play possum and keep his ears open.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">No Effect (Yellow)</div>
        <div style="font-size:.9em;">Just what it means, the character is not affected by the Stun result.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">No Effect (Red)</div>
        <div style="font-size:.9em;">Just what it means, the character is not affected by the Stun result.</div>
      </div>
      
      <p style="margin-top:10px;"><em><strong>Important:</strong> For any of these results to be effective on a target, the attacker must inflict some damage on the target. If Body Armor, force field, or natural invulnerabilities prevent damage, the Stun is negated. In borderline cases where damage is balanced by defenses (one more point needed), the target may still be affected by Stuns.</em></p>
    </div>`
  },

  "slam": {
    name: "Slam Check",
    ability: "Endurance",
    description: "Resist being knocked back or away.",
    effects: ["Grand Slam", "1 Area", "Stagger", "No Slam"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>The Slam result is possible as the result of Blunt Attacks and Charging and refers to the physical knocking down or away of an opponent. There are three types of Slam under the Advanced Set rules. The subject of a Slam result rolls on the Universal Table for an Endurance FEAT, checking the result on the Effects Table. The result may be No Slam, Stagger, 1 Area, or Grand Slam.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Grand Slam (White)</div>
        <div style="font-size:.9em;">The target is knocked away with a speed equal to the Strength of the attacker taken as ground speed. (A hit with Unearthly Strength sends the victim 10 areas.) The direction is determined as for 1 Area Slam.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">1 Area (Green)</div>
        <div style="font-size:.9em;">The target is knocked one area away (ranged or area movement). If the attacker inflicted any damage on the target, the attacker chooses the direction of the Slam (any compass direction or straight up or down). If no damage was inflicted, the defender chooses the direction (most likely avoiding fellow teammates, buildings, and other large, nasty items).</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">Stagger (Yellow)</div>
        <div style="font-size:.9em;">The target is knocked back a step or two, perhaps knocked to one knee, but is fully capable of engaging in combat next round. The Stagger result indicates the target takes the damage of a hit and is no longer considered adjacent to his attacker. There is no further damage unless the situation demands it. (Say, the target is on the edge of a cliff and staggers over the precipice -- a great way for villains to meet obscure deaths.)</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">No Slam (Red)</div>
        <div style="font-size:.9em;">The target is not affected by the slam. The target still takes damage as for a normal hit.</div>
      </div>
      
      <p style="margin-top:10px;">A character slammed into a building takes damage as if he were making a charging attack at that building. Buildings and other obstructions affect the speed of the character as for normal movement.</p>
      
      <p style="margin-top:10px;"><em><strong>Important:</strong> For any of these results to be effective on a target, the attacker must inflict some damage on the target. If Body Armor, force field, or natural invulnerabilities prevent damage, the Slam is negated. In borderline cases where damage is balanced by defenses (one more point needed), the target may still be affected by Slams.</em></p>
    </div>`
  },

  "kill": {
    name: "Kill Check",
    ability: "Endurance",
    description: "Resist fatal damage.",
    effects: ["Endurance Loss", "E/S", "No Effect"],
    details: `<div style="line-height:1.6; font-size:13px;">
      <p>The Kill result is potentially the most dangerous for the user (and definitely the target). A Kill result may be checked for as the result of an Energy attack, an Edged attack in Slugfest, or a Shooting attack. It may also be called for by reducing a character's total health to 0 -- see Life, Death, and Health, following.</p>
      
      <p>The target receiving a Kill result makes an Endurance FEAT on the Universal Table, checking under the Kill column of the Battle Table. There are three results on this table.</p>
      
      <div style="padding:6px 10px;margin:6px 0;background:#f5f5f5;border:1px solid #999;border-radius:3px;">
        <div style="font-weight:bold;color:#333;">Endurance Loss (White)</div>
        <div style="font-size:.9em;">The character's Endurance is reduced by one rank. The character is dying (check under Life, Death, and Health), and will continue to lose Endurance at one rank per turn until the situation is cleared.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#c8e6c9;border:1px solid #4caf50;border-radius:3px;">
        <div style="font-weight:bold;color:#1b5e20;">E/S (Green)</div>
        <div style="font-size:.9em;">The character is affected as an Endurance Loss only if the method of attack was Edged attack in Slugfest or a Shooting attack. Any other attack form is considered No Effect.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#fff9c4;border:1px solid #fbc02d;border-radius:3px;">
        <div style="font-weight:bold;color:#f57f17;">No Effect (Yellow)</div>
        <div style="font-size:.9em;">The character takes damage as listed for the attack form, but is not slain.</div>
      </div>
      
      <div style="padding:6px 10px;margin:6px 0;background:#ffcdd2;border:1px solid #e57373;border-radius:3px;">
        <div style="font-weight:bold;color:#c62828;">No Effect (Red)</div>
        <div style="font-size:.9em;">The character takes damage as listed for the attack form, but is not slain.</div>
      </div>
      
      <p style="margin-top:10px;padding:8px;background:#ffe0e0;border:1px solid #d32f2f;border-radius:4px;">
        <strong>⚠ A Kill result has detrimental effects on the attacker as well as the target. A hero who kills will lose all Karma.</strong>
      </p>
      
      <p style="margin-top:10px;"><em><strong>Important:</strong> For any of these results to be effective on a target, the attacker must inflict some damage on the target. If Body Armor, force field, or natural invulnerabilities prevent damage, the Kill is negated. In borderline cases where damage is balanced by defenses (one more point needed), the target may still be affected by Kills.</em></p>
    </div>`
  }
};