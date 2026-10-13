import type { Rng } from './rng';
import { MAX_LEVEL, UNIT_STATS, UnitType, xpForNextLevel } from './rules';
import {
  distance, effectiveAttack, effectiveDefense, terrainDefense, type GameState, type Unit,
} from './state';

/**
 * The original rolled `random.nextInt() % 20 + level`: a value in -19..19 where 0 is twice
 * as likely, nudged by experience. Only the extremes matter:
 *   >= 19 → +2, >= 16 → +1, <= -19 → -2, <= -16 → -1, otherwise 0.
 */
export function rollBonus(rng: Rng, level: number): number {
  const magnitude = rng(20);
  const roll = (rng(2) === 0 ? magnitude : -magnitude) + level;
  if (roll >= 19) return 2;
  if (roll >= 16) return 1;
  if (roll <= -19) return -2;
  if (roll <= -16) return -1;
  return 0;
}

/** Damage of one blow, already scaled by the attacker's remaining health. */
export function strike(state: GameState, attacker: Unit, defender: Unit, rng: Rng): number {
  let attack = effectiveAttack(attacker);
  if (UNIT_STATS[attacker.type].antiAir && UNIT_STATS[defender.type].flying) attack += 2;
  if (attacker.type === UnitType.Wisp && defender.type === UnitType.Skeleton) attack += 3;
  attack += rollBonus(rng, attacker.level);

  const defense = effectiveDefense(defender) + rollBonus(rng, defender.level);
  const cover = Math.trunc(((terrainDefense(state, defender) + defense) * 2) / 3);
  const raw = Math.trunc(((attack - cover) * attacker.hp) / 10);
  // The original had no lower bound, so a weak blow could heal; we clamp at zero.
  return Math.max(0, Math.min(raw, defender.hp));
}

function dealDamage(attacker: Unit, defender: Unit, damage: number): void {
  defender.hp -= damage;
  const victim = UNIT_STATS[defender.type];
  attacker.xp += (victim.attack + victim.defense) * damage;
}

export function canCounter(defender: Unit, attacker: Unit): boolean {
  return (
    defender.hp > 0 &&
    UNIT_STATS[defender.type].minRange === 1 &&
    distance(defender.x, defender.y, attacker.x, attacker.y) === 1
  );
}

export function levelUp(unit: Unit): boolean {
  if (unit.level >= MAX_LEVEL || unit.xp < xpForNextLevel(unit.level)) return false;
  unit.xp = 0;
  unit.level++;
  return true;
}

export interface Blow {
  attackerId: number;
  defenderId: number;
  damage: number;
}

export interface FightResult {
  blows: Blow[];
  /** Ids of units that went up a level. */
  leveledUp: number[];
}

/** Attack plus counter-attack. Deaths are left to the caller (they depend on game mode). */
export function fight(state: GameState, attacker: Unit, defender: Unit, rng: Rng): FightResult {
  const blows: Blow[] = [];
  const first = strike(state, attacker, defender, rng);
  dealDamage(attacker, defender, first);
  blows.push({ attackerId: attacker.id, defenderId: defender.id, damage: first });

  if (canCounter(defender, attacker)) {
    const second = strike(state, defender, attacker, rng);
    dealDamage(defender, attacker, second);
    blows.push({ attackerId: defender.id, defenderId: attacker.id, damage: second });
  }

  const leveledUp: number[] = [];
  if (attacker.hp > 0 && levelUp(attacker)) leveledUp.push(attacker.id);
  if (defender.hp > 0) {
    if (UNIT_STATS[attacker.type].poisons) defender.poisoned = true;
    else if (levelUp(defender)) leveledUp.push(defender.id);
  }
  return { blows, leveledUp };
}
