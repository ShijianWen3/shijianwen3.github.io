/*!
 * visitor-globe.js — self-contained 3D "hologram" globe for the book sidebar.
 *
 * - Rendering: Canvas 2D, land dots + glowing visitor cells. No external libs.
 * - Data: MQTT over WebSocket (retained messages on a public broker), with a
 *   same-origin JSON snapshot as fallback, plus localStorage cache for instant
 *   first paint. Only 1-degree cell counters are stored; no IP is persisted.
 */
(function () {
    'use strict';

    if (window.__visitorGlobeLoaded) return;
    window.__visitorGlobeLoaded = true;

    var root = document.getElementById('visitor-globe');
    if (!root) return;

    var canvas = root.querySelector('canvas');
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');

    /* ------------------------------------------------------------------ *
     * Land dot data: base64 of little-endian int16 pairs.
     * value = (lat * 2 + 180, lon * 2 + 360), sampled from Natural Earth.
     * Regenerate with scripts/gen_land.py.
     * ------------------------------------------------------------------ */
    /* LAND_DATA_START */
    var LAND_B64 = "SQDWAEkA3wBOANcAUwDXAFMA3wBYANgAWADfAFgAugJdANkAXQDgAF0AvAJiANQAYgDbAGIA4QBiAIkCYgCQAmcA1gBnANwAZwDjAGcA6QBnAPAAZwDIAmwA2ABsAN4AbADlAGwA6wBsAPEAbACDAmwAiQJsAI8CcQDbAHEA4QBxAOcAcQDtAHEA8wBxAPkAcQCPAXEAlQFxAJsBcQBPAnEAVQJxAFsCcQB5AnEAfwJxAIUCcQCLAnEAkQJxAJcCdgDeAHYA4wB2AOkAdgDvAHYA9QB2APsAdgABAXYAjQF2AJIBdgCYAXYAngF2AKQBdgBTAnYAWQJ2AF8CdgBkAnYAagJ2AHACdgB2AnYAfAJ2AIICdgCHAnYAjQJ2AJMCdgCZAnsA2wB7AOEAewDmAHsA7AB7APIAewD3AHsA/QB7AAMBewCLAXsAkQF7AJcBewCcAXsAogF7AKgBewBTAnsAWAJ7AF4CewBkAnsAaQJ7AG8CewB1AnsAegJ7AIACewCGAnsAiwJ7AJECewCXAoAA3wCAAOQAgADqAIAA7wCAAPUAgAD6AIAAAAGAAAUBgACLAYAAkQGAAJYBgACcAYAAoQGAAKcBgABOAoAAUwKAAFkCgABeAoAAZAKAAGkCgABvAoAAdQKAAHoCgACAAoAAhQKAAIsCgACQAoAAlgKFAN0AhQDiAIUA6ACFAO0AhQDzAIUA+ACFAP4AhQADAYUACAGFAA4BhQCGAYUAiwGFAJEBhQCWAYUAnAGFAKEBhQCnAYUArAGFAMIBhQDHAYUAUAKFAFUChQBaAoUAYAKFAGUChQBrAoUAcAKFAHYChQB7AoUAgQKFAIYChQCMAoUAkQKFAJYCigDcAIoA4QCKAOYAigDsAIoA8QCKAPYAigD8AIoAAQGKAAYBigAMAYoAEQGKABYBigCHAYoAjAGKAJIBigCXAYoAnAGKAKIBigCnAYoArAGKAMIBigDHAYoAUgKKAFgCigBdAooAYwKKAGgCigBtAooAcwKKAHgCigB9AooAgwKKAIgCigCNAooAswKPAOAAjwDlAI8A6wCPAPAAjwD1AI8A+gCPAAABjwAFAY8ACgGPABABjwAVAY8AhAGPAIkBjwCOAY8AkwGPAJkBjwCeAY8AowGPAKgBjwCuAY8AwwGPAMgBjwBcAo8AYQKPAGYCjwBsAo8AcQKPAHYCjwB7Ao8AgQKPAIYCjwCLApQAAACUANUAlADaAJQA4ACUAOUAlADqAJQA7wCUAPQAlAD6AJQA/wCUAAQBlAAJAZQADgGUABQBlAAZAZQAgQGUAIYBlACLAZQAkQGUAJYBlACbAZQAoAGUAKUBlACrAZQAsAGUALUBlADFAZQAygGUAGEClABmApQAawKUAHAClAB1ApQAewKUAIUClACKApkA0ACZANUAmQDbAJkA4ACZAOUAmQDqAJkA7wCZAPQAmQD5AJkA/wCZAAQBmQAJAZkADgGZABMBmQAYAZkAhAGZAIkBmQCPAZkAlAGZAJkBmQCeAZkAowGZAKgBmQCtAZkAswGZALgBmQDMAZkAcQKZAHYCmQCFAp4A0QCeANYAngDbAJ4A4ACeAOUAngDqAJ4A7wCeAPQAngD6AJ4A/wCeAAQBngAJAZ4ADgGeABMBngAYAZ4AHQGeAIMBngCIAZ4AjQGeAJIBngCXAZ4AnQGeAKIBngCnAZ4ArAGeALEBngC2AaMAzQCjANIAowDXAKMA3ACjAOEAowDmAKMA6wCjAPAAowD1AKMA+gCjAP8AowAEAaMACQGjAA4BowAUAaMAGQGjAB4BowCDAaMAiAGjAI0BowCSAaMAlwGjAJwBowChAaMApgGjAKsBowCwAaMAtQGjAE0CowBSAqMAXAKjAIUCowCPAqMAqAKoAMkAqADOAKgA0wCoANgAqADdAKgA4gCoAOcAqADsAKgA8QCoAPYAqAD7AKgAAAGoAAUBqAAKAagADwGoABUBqAAaAagAHwGoAIMBqACIAagAjQGoAJIBqACXAagAnAGoAKEBqACmAagAqwGoALABqAC1AagAPQKoAHQCqAB+AqgAhAKoAIkCqACOAqgAkwKtAMsArQDQAK0A1QCtANoArQDfAK0A5ACtAOkArQDuAK0A8wCtAPgArQD9AK0AAgGtAAcBrQAMAa0AEQGtABYBrQB/Aa0AhAGtAIkBrQCOAa0AkwGtAJgBrQCdAa0AogGtAKcBrQCsAa0AsQGtALYBrQA5Aq0AVwKtAFwCrQBmAq0AdQKtAHoCrQB/Aq0AhAKyAMgAsgDNALIA0gCyANcAsgDcALIA4QCyAOYAsgDrALIA8ACyAPUAsgD6ALIA/wCyAAQBsgAJAbIAfAGyAIEBsgCGAbIAiwGyAJABsgCVAbIAmgGyAJ8BsgCkAbIAqQGyAK4BsgCzAbIAuAGyADUCsgBEArIASQKyAE4CsgBYArIAXQKyAHECtwDLALcA0AC3ANUAtwDaALcA3wC3AOQAtwDpALcA7gC3APMAtwD4ALcA/QC3AAIBtwB/AbcAhAG3AIkBtwCOAbcAkwG3AJgBtwCdAbcAogG3AKcBtwCsAbcAsQG3ALYBtwC7AbcAwAG3AC4CtwAzArcAOAK3AEcCtwBMArcAUQK8AM4AvADTALwA2AC8AN0AvADiALwA5wC8AOwAvADxALwA9gC8APsAvAAAAbwAfQG8AIIBvACHAbwAjAG8AJEBvACWAbwAmwG8AKABvAClAbwAqgG8AK8BvAC0AbwAuQG8AL4BvADDAbwALAK8ADECvAA2ArwATwLBANEAwQDWAMEA2wDBAOAAwQDlAMEA6gDBAO8AwQD0AMEAVAHBAFkBwQBeAcEAYwHBAGgBwQBtAcEAcgHBAHcBwQB8AcEAgQHBAIYBwQCLAcEAkAHBAJUBwQCaAcEAnwHBAKQBwQCpAcEArgHBALMBwQC4AcEAvQHBAMIBwQDHAcEACQLBADECwQBjAsYAxQDGAMoAxgDQAMYA1QDGANoAxgDfAMYA5ADGAOkAxgDuAMYATgHGAFMBxgBYAcYAXQHGAGIBxgBnAcYAbAHGAHIBxgB3AcYAfAHGAIEBxgCGAcYAiwHGAJABxgCVAcYAmgHGAJ8BxgCkAcYAqQHGAK4BxgCzAcYAuAHGAL0BxgDDAcYAyAHGAM0BxgAEAsYACQLGAC0CxgBlAssAvwDLANQAywDeAMsASQHLAE4BywBTAcsAWAHLAF4BywBjAcsAaAHLAG0BywByAcsAdwHLAHwBywCBAcsAhgHLAIsBywCRAcsAlgHLAJsBywCgAcsApQHLAKoBywCvAcsAtAHLALkBywC+AcsAyQHLAM4BywABAssABgLLAC8CywA5AssAPgLLAF0CywBiAtAAtADQALoA0AC/ANAASgHQAE8B0ABUAdAAWQHQAF4B0ABkAdAAaQHQAG4B0ABzAdAAeAHQAH0B0ACCAdAAiAHQAI0B0ACSAdAAlwHQAJwB0AChAdAApwHQAKwB0ACxAdAAtgHQALsB0ADAAdAAxQHQAP4B0AADAtAACALQAC0C0AAyAtAANwLQADwC0ABBAtAAWwLVAKQA1QCpANUArwDVALQA1QBLAdUAUAHVAFYB1QBbAdUAYAHVAGUB1QBqAdUAcAHVAHUB1QB6AdUAfwHVAIQB1QCKAdUAjwHVAJQB1QCZAdUAnwHVAKQB1QCpAdUArgHVALMB1QC+AdUAwwHVAMgB1QDOAdUA/AHVAAIC1QAHAtUAJgLVACsC1QAxAtUANgLVADsC1QBaAtoAmQDaAJ8A2gCkANoAtADaANkA2gDeANoASAHaAE0B2gBSAdoAWAHaAF0B2gBiAdoAaAHaAG0B2gByAdoAdwHaAH0B2gCCAdoAhwHaAI0B2gCSAdoAlwHaAJwB2gCiAdoApwHaAKwB2gCyAdoAvAHaAMEB2gDHAdoAzAHaANEB2gDXAdoA/AHaAAEC2gAGAtoADALaABEC2gAmAtoAKwLaADEC2gA2AtoAOwLfAJkA3wCfAN8ApADfALkA3wBKAd8AUAHfAFUB3wBbAd8AYAHfAGUB3wBrAd8AcAHfAHUB3wB7Ad8AgAHfAIYB3wCLAd8AkAHfAJYB3wCbAd8AoAHfAKYB3wCrAd8AsQHfALsB3wDBAd8AxgHfAMsB3wDRAd8A1gHfANwB3wD2Ad8A/AHfAAEC3wAHAt8ADALfABEC3wAhAt8AJwLfACwC3wAyAt8ANwLfADwC5ACUAOQAmQDkAJ8A5ACkAOQATgHkAFMB5ABZAeQAXgHkAGQB5ABpAeQAbwHkAHQB5AB6AeQAfwHkAIUB5ACKAeQAkAHkAJUB5ACaAeQAoAHkAKUB5ACrAeQAtgHkALsB5ADBAeQAxgHkAMwB5ADRAeQA1wHkAPIB5AD4AeQA/QHkAAIC5AAIAuQADQLkABMC5AAYAuQAHgLkACMC5AApAuQALgLkADQC5AA5AuQAPwLkAEQC5ABKAuQATwLkAFoC6QCJAOkAjgDpAJQA6QCaAOkAnwDpAKUA6QDGAOkATAHpAFIB6QBYAekAXQHpAGMB6QBoAekAbgHpAHQB6QB5AekAfwHpAIQB6QCKAekAjwHpAJUB6QCbAekAoAHpAKYB6QCrAekAsQHpALcB6QC8AekAwgHpAMcB6QDeAekA4wHpAOkB6QDuAekA9AHpAPoB6QD/AekABQLpAAoC6QAQAukAFgLpABsC6QAhAukAJgLpACwC6QAxAukANwLpAD0C6QBCAukASALpAE0C6QBTAu4AgwDuAIkA7gCPAO4AlQDuAJoA7gCgAO4ApgDuAFcB7gBdAe4AYgHuAGgB7gBuAe4AdAHuAHkB7gB/Ae4AhQHuAIoB7gCQAe4AlgHuAJwB7gChAe4ApwHuAK0B7gCyAe4AuAHuAL4B7gDEAe4AzwHuANUB7gDaAe4A4AHuAOYB7gDsAe4A8QHuAPcB7gD9Ae4AAwLuAAgC7gAOAu4AFALuABkC7gAfAu4AJQLuACsC7gAwAu4ANgLuADwC7gBBAu4ARwLuAE0C7gBTAu4AWALzAIoA8wCQAPMAlgDzAJsA8wChAPMApwDzAK0A8wCzAPMAuQDzAL8A8wDEAPMAVwHzAF0B8wBjAfMAaQHzAG8B8wB0AfMAegHzAIAB8wCGAfMAkgHzAJgB8wCdAfMArwHzALUB8wC7AfMAwQHzAMYB8wDMAfMA0gHzANgB8wDeAfMA5AHzAOoB8wDwAfMA9QHzAPsB8wABAvMABwLzAA0C8wATAvMAGQLzAB4C8wAkAvMAKgLzADAC8wA2AvMAPALzAEIC8wBHAvMATQLzAFMC8wBZAvgAfwD4AIUA+ACLAPgAkQD4AJcA+ACdAPgAowD4AKkA+ACvAPgAtQD4ALsA+ADBAPgAxwD4AF4B+ABkAfgAagH4AHAB+AB2AfgAfAH4ALIB+AC4AfgAvgH4AMQB+ADKAfgA0AH4ANYB+ADcAfgA4gH4AOkB+ADvAfgA9QH4APsB+AABAvgABwL4AA0C+AATAvgAGQL4AB8C+AAlAvgAKwL4ADEC+AA3AvgAPQL4AEMC+ABJAvgATwL4AFUC+ABtAvgAcwL9AHkA/QCAAP0AhgD9AIwA/QCSAP0AmAD9AJ8A/QClAP0AqwD9ALEA/QC3AP0AvgD9AMQA/QDKAP0A0AD9AGwB/QByAf0AeAH9AKQB/QCqAf0AsAH9ALcB/QC9Af0AwwH9AMkB/QDPAf0A1gH9ANwB/QDiAf0A6AH9AO4B/QD1Af0A+wH9AAEC/QAHAv0ADgL9ABQC/QAaAv0AIAL9ACYC/QAtAv0AMwL9ADkC/QA/Av0ARgL9AEwC/QBSAv0AWAL9AGUC/QBrAv0AfgICAXQAAgF6AAIBgQACAYcAAgGOAAIBlAACAZoAAgGhAAIBpwACAa4AAgG0AAIBuwACAcEAAgHHAAIBzgACAVUBAgFbAQIBYgECAYgBAgGVAQIBogECAakBAgGvAQIBtQECAbwBAgHCAQIByQECAc8BAgHWAQIB3AECAeMBAgHpAQIB7wECAfYBAgH8AQIBAwICAQkCAgEQAgIBFgICARwCAgEjAgIBKQICATACAgE2AgIBPQICAUMCAgFJAgIBUAICAWMCAgGDAgcBdQAHAXwABwGCAAcBiQAHAZAABwGWAAcBnQAHAaQABwGqAAcBsQAHAbgABwG+AAcBxQAHAcwABwHSAAcB2QAHAVgBBwFeAQcBZQEHAWwBBwGHAQcBlAEHAZsBBwGhAQcBqAEHAa8BBwG8AQcBwwEHAckBBwHQAQcB1wEHAd0BBwHkAQcB6wEHAfEBBwH4AQcB/wEHAQUCBwEMAgcBEwIHARkCBwEgAgcBJwIHAS0CBwE0AgcBOwIHAUECBwFIAgcBTwIHAVUCBwFcAgcBYwIHAWoCDAF2AAwBfQAMAYQADAGLAAwBkgAMAZkADAGgAAwBpwAMAa4ADAG1AAwBvAAMAcMADAHKAAwB0QAMAdcADAHlAAwBaQEMAXABDAF3AQwBfgEMAYwBDAGTAQwBmgEMAaEBDAG9AQwBxAEMAcsBDAHSAQwB2QEMAeABDAHnAQwB7gEMAfQBDAH7AQwBAgIMAQkCDAEQAgwBFwIMAR4CDAElAgwBLAIMATMCDAE6AgwBQQIMAUgCDAFPAgwBVgIMAV0CDAFkAgwBawIMAXICDAGGAhEBcQARAXgAEQF/ABEBhgARAY4AEQGVABEBnAARAaMAEQGrABEBsgARAbkAEQHAABEByAARAc8AEQHWABEB3gARAeUAEQFoAREBbwERAXYBEQF9AREBhQERAYwBEQGTAREBmgERAaIBEQGpAREBtwERAb8BEQHGAREBzQERAdUBEQHcAREB4wERAeoBEQHyAREB+QERAQACEQEHAhEBDwIRARYCEQEdAhEBJAIRASwCEQEzAhEBOgIRAUECEQFJAhEBUAIRAVcCEQFfAhEBZgIRAW0CEQF0AhEBfAIWAXIAFgF6ABYBggAWAYkAFgGRABYBmAAWAaAAFgGoABYBrwAWAbcAFgG/ABYBxgAWAc4AFgHVABYB3QAWAeUAFgH0ABYB/AAWAWYBFgFuARYBdQEWAX0BFgGFARYBjAEWAZQBFgGcARYBowEWAasBFgGyARYBugEWAcIBFgHJARYB0QEWAdkBFgHgARYB6AEWAe8BFgH3ARYB/wEWAQYCFgEOAhYBFQIWAR0CFgElAhYBLAIWATQCFgE8AhYBQwIWAUsCFgFSAhYBWgIWAWICFgFpAhYBcQIWAXkCFgGAAhsBbAAbAXQAGwF8ABsBhQAbAY0AGwGVABsBnQAbAaUAGwGtABsBtQAbAb0AGwHFABsBzQAbAdUAGwHdABsB5QAbAe0AGwH1ABsBZQEbAXUBGwF+ARsBhgEbAY4BGwGWARsBngEbAaYBGwGuARsBtgEbAb4BGwHGARsBzgEbAdYBGwHeARsB5gEbAe4BGwH2ARsB/gEbAQYCGwEOAhsBFgIbAR4CGwEmAhsBLgIbATYCGwE+AhsBRgIbAU4CGwFWAhsBXgIbAWYCGwFuAhsBdwIbAX8CGwGHAiABXgAgAWYAIAFvACABdwAgAYAAIAGIACABkQAgAZkAIAGiACABqgAgAbMAIAG7ACABzAAgAdUAIAHdACAB5gAgAe4AIAFlASABfwEgAYcBIAGQASABmAEgAaEBIAGpASABsgEgAboBIAHDASABywEgAdQBIAHcASAB5QEgAe0BIAH2ASAB/gEgAQcCIAEPAiABGAIgASACIAEpAiABMQIgAToCIAFCAiABSwIgAVMCIAFcAiABZAIgAW0CIAF1AiABfgIgAaACIAGpAiUBKQAlAWgAJQFxACUBegAlAYMAJQGMACUBlQAlAZ8AJQGoACUBsQAlAdUAJQHeACUB5wAlAV0BJQGBASUBkwElAZwBJQGlASUBrgElAbcBJQHAASUByQElAdMBJQHcASUB5QElAe4BJQH3ASUBAAIlAQkCJQESAiUBGwIlASQCJQEtAiUBNgIlAT8CJQFIAiUBUQIlAVoCJQFjAiUBbQIlAXYCJQGjAiUBrAIqATEAKgFXACoBYQAqAWsAKgF0ACoBfgAqAYgAKgGSACoBmwAqAaUAKgHMACoB1gAqAd8AKgHpACoBewEqAYQBKgGYASoBoQEqAasBKgG1ASoBvwEqAcgBKgHSASoB3AEqAeUBKgHvASoB+QEqAQMCKgEMAioBFgIqASACKgEpAioBMwIqAT0CKgFGAioBUAIqAVoCKgFkAioBbQIqAXcCKgGBAioBqAIvASUALwEvAC8BOgAvAUQALwFPAC8BWQAvAWQALwFuAC8BeQAvAYMALwGNAC8BmAAvAaIALwGtAC8BzAAvAdcALwELAS8BdAEvAX4BLwGJAS8BkwEvAZ4BLwGoAS8BswEvAb0BLwHIAS8B0gEvAd0BLwHnAS8B8gEvAfwBLwEHAi8BEQIvARwCLwEmAi8BMQIvATsCLwFGAi8BUAIvAVsCLwFlAi8BbwIvAXoCLwGEAi8BjwIvAZkCLwG5AjQBLgA0ATkANAFEADQBUAA0AVsANAFnADQBcgA0AX0ANAGJADQBlAA0AaAANAGrADQBtgA0AcIANAHZADQB5AA0AQYBNAESATQBPwE0AYQBNAGPATQBmwE0AaYBNAG9ATQByAE0AdQBNAHfATQB6gE0AfYBNAEBAjQBDQI0ARgCNAEjAjQBLwI0AToCNAFGAjQBUQI0AV0CNAFoAjQBcwI0AX8CNAGKAjQBlgI0AaECNAGsAjQBuAI0AcMCOQEGADkBHwA5ASwAOQE4ADkBRQA5AVIAOQFeADkBawA5AXcAOQGEADkBkAA5AZ0AOQGpADkBtgA5AdsAOQHoADkBAQE5AQ4BOQEaATkBiwE5AZgBOQGkATkBsQE5Ab0BOQHKATkB1gE5AeMBOQHvATkB/AE5AQgCOQEVAjkBIQI5AS4COQE7AjkBRwI5AVQCOQFgAjkBbQI5AXkCOQGGAjkBkgI5AZ8COQGrAjkBuAI5AcQCPgEAAD4BHAA+ASoAPgE4AD4BRgA+AVQAPgFiAD4BcAA+AX4APgGMAD4BmQA+AacAPgG1AD4BwwA+AdEAPgHfAD4BCQE+ARcBPgElAT4BMwE+AZUBPgGjAT4BsQE+AegBPgH2AT4BBAI+ARICPgEgAj4BLgI+ATwCPgFKAj4BWAI+AWYCPgF0Aj4BggI+AZACPgGeAj4BrAI+AboCPgHIAkMBdgBDAYYAQwGWAEMBtQBDAcUAQwHVAEMBBAFDARQBQwEkAUMBMwFDAdEBQwHwAUMBAAJDARACQwEgAkMBLwJDAT8CQwFPAkMBXwJDAX4CQwGOAkgBfwBIAf4ASAEQAUgBIgFIATQBSAHYAUgBDgJIASACSAEyAkgBRAJNAaoATQG+AE0B5gBNAfoATQEOAU0BIgFNATYBTQHqAU0BOgJSAbQAUgHIAFIB8ABSAQQBUgEYAVIBLAFSAUABUgGQAVcBvgBXAdIAVwH6AFcBDgFXASIBVwE2AVcBSgE=";
    /* LAND_DATA_END */

    var CFG = {
        snapshotUrl: root.getAttribute('data-snapshot') || '',
        brokerUrl: root.getAttribute('data-broker') || 'wss://broker.emqx.io:8084/mqtt',
        topicPrefix: root.getAttribute('data-topic') || 'sjbook/geo/v1/',
        cellDegrees: 1,
        geoServices: [
            'https://ipwho.is/',
            'https://ipinfo.io/json',
            'https://ipapi.co/json/'
        ],
        maxCells: 4000,
        cacheKey: 'sjglobe.v1',
        sessionKey: 'sjglobe.session.v1'
    };

    var TAU = Math.PI * 2;
    var reduceMotion = false;
    try {
        reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { /* ignore */ }

    var statVisits = root.querySelector('[data-stat="visits"]');
    var statRegions = root.querySelector('[data-stat="regions"]');
    var statusEl = root.querySelector('[data-status]');
    var youEl = root.querySelector('[data-you]');
    var youLabelEl = root.querySelector('[data-you-label]');

    /* ------------------------------------------------------------------ *
     * Canvas / projection
     * ------------------------------------------------------------------ */
    var width = 0;
    var height = 0;
    var radius = 0;
    var centerX = 0;
    var centerY = 0;
    var dpr = 1;

    var rotY = -110 * Math.PI / 180;   // start with Asia facing the viewer
    var tilt = 0.28;
    var autoRotate = !reduceMotion;
    var resumeAt = 0;
    var velocity = 0;
    var dragging = false;

    var land = null;

    function decodeLand(b64) {
        var bin = atob(b64);
        var count = bin.length >> 2;
        var out = new Float32Array(count * 3);
        for (var i = 0; i < count; i++) {
            var ilat = bin.charCodeAt(i * 4) | (bin.charCodeAt(i * 4 + 1) << 8);
            var ilon = bin.charCodeAt(i * 4 + 2) | (bin.charCodeAt(i * 4 + 3) << 8);
            // deterministic sub-degree jitter breaks up the sampling grid
            var j1 = Math.sin(i * 12.9898) * 43758.5453;
            var j2 = Math.sin(i * 78.233) * 12345.6789;
            j1 = (j1 - Math.floor(j1)) - 0.5;
            j2 = (j2 - Math.floor(j2)) - 0.5;
            var lat = ((ilat - 180) / 2 + j1 * 0.7) * Math.PI / 180;
            var lon = ((ilon - 360) / 2 + j2 * 0.7) * Math.PI / 180;
            out[i * 3] = Math.sin(lat);        // y
            out[i * 3 + 1] = Math.cos(lat);    // r (cos of latitude)
            out[i * 3 + 2] = lon;              // longitude in radians
        }
        return out;
    }

    function resize() {
        var rect = canvas.getBoundingClientRect();
        width = Math.max(1, Math.round(rect.width));
        // keep the canvas square even where aspect-ratio is unsupported
        if (Math.abs(rect.height - width) > 1) {
            canvas.style.height = width + 'px';
            rect = canvas.getBoundingClientRect();
        }
        height = Math.max(1, Math.round(rect.height));
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        radius = Math.min(width, height) * 0.405;
        centerX = width / 2;
        centerY = height / 2;
        makeGradients();
    }

    var shadeGradient = null;
    var haloGradient = null;

    function makeGradients() {
        var g = ctx.createRadialGradient(
            centerX - radius * 0.32, centerY - radius * 0.38, radius * 0.05,
            centerX, centerY, radius * 1.02
        );
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(0.55, 'rgba(249, 253, 252, 1)');
        g.addColorStop(0.88, 'rgba(235, 245, 241, 1)');
        g.addColorStop(1, 'rgba(220, 235, 230, 1)');
        shadeGradient = g;

        var h = ctx.createRadialGradient(centerX, centerY, radius * 0.9, centerX, centerY, radius * 1.32);
        h.addColorStop(0, 'rgba(46, 170, 128, 0.12)');
        h.addColorStop(0.35, 'rgba(46, 170, 128, 0.04)');
        h.addColorStop(1, 'rgba(46, 170, 128, 0)');
        haloGradient = h;
    }

    function project(latSin, latCos, lon) {
        var theta = lon + rotY;
        var x = latCos * Math.sin(theta);
        var z = latCos * Math.cos(theta);
        var y = latSin;
        var ct = Math.cos(tilt);
        var st = Math.sin(tilt);
        var y2 = y * ct - z * st;
        var z2 = y * st + z * ct;
        return [x, y2, z2];
    }

    /* ------------------------------------------------------------------ *
     * Glow sprites
     * ------------------------------------------------------------------ */
    function makeGlow(r, g, b, peak) {
        var size = 64;
        var c = document.createElement('canvas');
        c.width = c.height = size;
        var g2 = c.getContext('2d');
        var grad = g2.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + peak + ')');
        grad.addColorStop(0.24, 'rgba(' + r + ',' + g + ',' + b + ',' + (peak * 0.58).toFixed(3) + ')');
        grad.addColorStop(0.55, 'rgba(' + r + ',' + g + ',' + b + ',' + (peak * 0.16).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        g2.fillStyle = grad;
        g2.fillRect(0, 0, size, size);
        return c;
    }

    var visitorGlow = makeGlow(28, 110, 220, 0.34);
    var youGlow = makeGlow(224, 104, 18, 0.30);

    /* ------------------------------------------------------------------ *
     * Data
     * ------------------------------------------------------------------ */
    var cells = Object.create(null);       // key -> count (display)
    var snapshotCells = Object.create(null);
    var mqttCells = Object.create(null);
    var snapshotReady = false;
    var geo = null;
    var session = {};

    try { session = JSON.parse(sessionStorage.getItem(CFG.sessionKey) || '{}') || {}; } catch (e) { session = {}; }

    function saveSession() {
        try { sessionStorage.setItem(CFG.sessionKey, JSON.stringify(session)); } catch (e) { /* ignore */ }
    }

    function validKey(key) {
        var parts = key.split('-');
        if (parts.length !== 2) return false;
        var a = +parts[0], b = +parts[1];
        return a >= 0 && a <= 180 && b >= 0 && b <= 360;
    }

    function cellKey(lat, lon) {
        var a = Math.round(lat / CFG.cellDegrees) + 90;
        var b = Math.round(lon / CFG.cellDegrees) + 180;
        return a + '-' + b;
    }

    function cellCenter(key) {
        var parts = key.split('-');
        return {
            lat: (+parts[0] - 90) * CFG.cellDegrees,
            lon: (+parts[1] - 180) * CFG.cellDegrees
        };
    }

    function mergeInto(target, source) {
        for (var k in source) {
            if (!Object.prototype.hasOwnProperty.call(source, k) || !validKey(k)) continue;
            var n = Math.floor(+source[k]);
            if (!isFinite(n) || n <= 0) continue;
            target[k] = Math.max(target[k] || 0, Math.min(n, 1000000));
        }
    }

    function mergeCells(source) {
        mergeInto(cells, source);
    }

    function loadCache() {
        try {
            var raw = localStorage.getItem(CFG.cacheKey);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (data && data.cells) mergeCells(data.cells);
        } catch (e) { /* ignore */ }
    }

    function saveCache() {
        try {
            var keys = Object.keys(cells);
            if (keys.length > CFG.maxCells) keys = keys.slice(0, CFG.maxCells);
            var slim = {};
            for (var i = 0; i < keys.length; i++) slim[keys[i]] = cells[keys[i]];
            localStorage.setItem(CFG.cacheKey, JSON.stringify({ v: 1, ts: Date.now(), cells: slim }));
        } catch (e) { /* ignore */ }
    }

    function loadSnapshot() {
        if (!CFG.snapshotUrl) return Promise.resolve();
        return fetch(CFG.snapshotUrl, { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (data && data.cells) {
                    snapshotCells = data.cells;
                    mergeCells(data.cells);
                }
            })
            .catch(function () { /* ignore */ })
            .then(function () { snapshotReady = true; });
    }

    function locate() {
        if (session.loc) {
            geo = session.loc;
            updateYou();
            return Promise.resolve();
        }
        var chain = Promise.reject();
        CFG.geoServices.forEach(function (url) {
            chain = chain.catch(function () {
                return fetchJson(url, 5000).then(function (data) {
                    var lat = data && (data.latitude !== undefined ? data.latitude : data.lat);
                    var lon = data && (data.longitude !== undefined ? data.longitude : data.lon);
                    if ((lat === undefined || lon === undefined) && data && typeof data.loc === 'string') {
                        var locParts = data.loc.split(',');
                        lat = locParts[0];
                        lon = locParts[1];
                    }
                    if (data && (data.success === false || data.error)) throw new Error('no location');
                    lat = +lat;
                    lon = +lon;
                    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
                        throw new Error('bad location');
                    }
                    return {
                        lat: lat,
                        lon: lon,
                        city: data.city || data.region || '',
                        country: data.country_code || data.country || ''
                    };
                });
            });
        });
        return chain.then(function (loc) {
            geo = loc;
            session.loc = loc;
            saveSession();
            updateYou();
        }).catch(function () { /* stay anonymous */ });
    }

    function fetchJson(url, timeout) {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout);
        return fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error('http ' + res.status);
                return res.json();
            })
            .then(function (data) {
                clearTimeout(timer);
                return data;
            }, function (err) {
                clearTimeout(timer);
                throw err;
            });
    }

    /* ------------------------------------------------------------------ *
     * Minimal MQTT 3.1.1 client over WebSocket
     * ------------------------------------------------------------------ */
    var mqtt = {
        ws: null,
        buffer: new Uint8Array(0),
        connected: false,
        subscribed: false,
        attempt: 0,
        pingTimer: null,
        publishTimer: null,
        published: false,
        known: 0
    };

    function utf8(text) {
        return new TextEncoder().encode(text);
    }

    function mqttString(text) {
        var bytes = utf8(text);
        var out = new Uint8Array(bytes.length + 2);
        out[0] = bytes.length >> 8;
        out[1] = bytes.length & 255;
        out.set(bytes, 2);
        return out;
    }

    function encodeRemaining(len) {
        var out = [];
        do {
            var digit = len % 128;
            len = Math.floor(len / 128);
            if (len > 0) digit |= 0x80;
            out.push(digit);
        } while (len > 0);
        return out;
    }

    function buildPacket(firstByte, parts) {
        var length = 0;
        var i;
        for (i = 0; i < parts.length; i++) length += parts[i].length;
        var header = encodeRemaining(length);
        var packet = new Uint8Array(1 + header.length + length);
        packet[0] = firstByte;
        for (i = 0; i < header.length; i++) packet[1 + i] = header[i];
        var offset = 1 + header.length;
        for (i = 0; i < parts.length; i++) {
            packet.set(parts[i], offset);
            offset += parts[i].length;
        }
        return packet;
    }

    function mqttSend(packet) {
        if (mqtt.ws && mqtt.ws.readyState === 1) mqtt.ws.send(packet);
    }

    function mqttConnect() {
        var ws;
        try {
            ws = new WebSocket(CFG.brokerUrl, 'mqtt');
        } catch (e) {
            return;
        }
        mqtt.ws = ws;
        ws.binaryType = 'arraybuffer';
        setStatus('sync');

        var failTimer = setTimeout(function () {
            if (!mqtt.connected && ws.readyState <= 1) {
                try { ws.close(); } catch (e) { /* ignore */ }
            }
        }, 7000);

        ws.onopen = function () {
            var clientId = 'sjg-' + Math.random().toString(36).slice(2, 10);
            var body = [
                mqttString('MQTT'),
                new Uint8Array([4, 0x02, 0x00, 60]),
                mqttString(clientId)
            ];
            mqttSend(buildPacket(0x10, body));
        };

        ws.onmessage = function (event) {
            if (!(event.data instanceof ArrayBuffer)) return;
            var chunk = new Uint8Array(event.data);
            var merged = new Uint8Array(mqtt.buffer.length + chunk.length);
            merged.set(mqtt.buffer);
            merged.set(chunk, mqtt.buffer.length);
            mqtt.buffer = merged;
            mqttDrain();
        };

        ws.onerror = function () { /* handled by onclose */ };

        ws.onclose = function () {
            clearTimeout(failTimer);
            mqtt.connected = false;
            mqtt.subscribed = false;
            if (mqtt.pingTimer) { clearInterval(mqtt.pingTimer); mqtt.pingTimer = null; }
            if (mqtt.attempt < 1) {
                mqtt.attempt++;
                setTimeout(mqttConnect, 4500);
            } else {
                setStatus(snapshotReady ? 'snapshot' : 'offline');
            }
        };
    }

    function mqttDrain() {
        var buf = mqtt.buffer;
        var offset = 0;
        while (buf.length - offset >= 2) {
            var first = buf[offset];
            var len = 0;
            var mult = 1;
            var index = offset + 1;
            var complete = false;
            for (; index < buf.length && index <= offset + 4; index++) {
                var digit = buf[index];
                len += (digit & 127) * mult;
                mult *= 128;
                if (!(digit & 128)) {
                    index++;
                    complete = true;
                    break;
                }
            }
            if (!complete) break;
            if (buf.length - index < len) break;
            mqttHandle(first, buf.subarray(index, index + len));
            offset = index + len;
        }
        if (offset > 0) mqtt.buffer = buf.slice(offset);
    }

    function mqttHandle(first, packet) {
        var type = first >> 4;
        if (type === 2) {                     // CONNACK
            if (packet.length >= 2 && packet[1] === 0) {
                mqtt.connected = true;
                var filter = mqttString(CFG.topicPrefix + '#');
                var body = new Uint8Array(2 + filter.length + 1);
                body[0] = 0;
                body[1] = 1;
                body.set(filter, 2);
                body[body.length - 1] = 0;
                mqttSend(buildPacket(0x82, [body]));
                mqtt.pingTimer = setInterval(function () {
                    mqttSend(new Uint8Array([0xc0, 0x00]));
                }, 45000);
            }
        } else if (type === 9) {              // SUBACK
            mqtt.subscribed = true;
            setStatus('live');
            if (mqtt.publishTimer) clearTimeout(mqtt.publishTimer);
            mqtt.publishTimer = setTimeout(mqttAnnounce, 1200);
        } else if (type === 3) {              // PUBLISH
            mqttPublishIn(first, packet);
        }
    }

    function mqttPublishIn(first, packet) {
        if (packet.length < 2) return;
        var qos = (first >> 1) & 3;
        var topicLen = (packet[0] << 8) | packet[1];
        if (packet.length < 2 + topicLen) return;
        var topic = new TextDecoder().decode(packet.subarray(2, 2 + topicLen));
        var payloadStart = 2 + topicLen;
        var packetId = 0;
        if (qos > 0) {
            if (packet.length < payloadStart + 2) return;
            packetId = (packet[payloadStart] << 8) | packet[payloadStart + 1];
            payloadStart += 2;
        }
        if (qos === 1) {
            mqttSend(new Uint8Array([0x40, 0x02, packetId >> 8, packetId & 255]));
        }
        var key = topic.slice(CFG.topicPrefix.length);
        if (!validKey(key)) return;
        var count = parseInt(new TextDecoder().decode(packet.subarray(payloadStart)), 10);
        if (!isFinite(count) || count <= 0) return;
        count = Math.min(count, 1000000);
        if (!(key in mqttCells)) {
            if (mqtt.known >= 5000) return;   // ignore a flooded namespace
            mqtt.known++;
        }
        mqttCells[key] = Math.max(mqttCells[key] || 0, count);
        cells[key] = Math.max(cells[key] || 0, count);
        scheduleFlush();
    }

    function mqttAnnounce() {
        if (mqtt.published || !geo || !mqtt.subscribed) return;
        if (session.pub) {             // one increment per browser session
            mqtt.published = true;
            return;
        }
        var key = cellKey(geo.lat, geo.lon);
        var base = Math.max(cells[key] || 0, snapshotCells[key] || 0, mqttCells[key] || 0);
        var next = base + 1;
        var topic = mqttString(CFG.topicPrefix + key);
        var body = new Uint8Array(topic.length + String(next).length);
        body.set(topic, 0);
        body.set(utf8(String(next)), topic.length);
        mqttSend(buildPacket(0x31, [body]));   // QoS 0 + retain
        mqtt.published = true;
        session.pub = true;
        saveSession();
        mqttCells[key] = Math.max(mqttCells[key] || 0, next);
        cells[key] = Math.max(cells[key] || 0, next);
        scheduleFlush();
    }

    /* ------------------------------------------------------------------ *
     * HUD
     * ------------------------------------------------------------------ */
    function formatNumber(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
        if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function updateStats() {
        var keys = Object.keys(cells);
        var total = 0;
        for (var i = 0; i < keys.length; i++) total += cells[keys[i]];
        if (statVisits) statVisits.textContent = formatNumber(total);
        if (statRegions) statRegions.textContent = formatNumber(keys.length);
    }

    var flushTimer = 0;

    // retained messages can arrive in a burst; batch the UI/localStorage work
    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(function () {
            flushTimer = 0;
            updateStats();
            saveCache();
        }, 250);
    }

    function updateYou() {
        if (!geo || !youEl) return;
        var parts = [];
        if (geo.city) parts.push(geo.city);
        if (geo.country) parts.push(geo.country);
        if (!parts.length) return;
        if (youLabelEl) youLabelEl.textContent = parts.join(', ');
        youEl.classList.add('is-visible');
    }

    function setStatus(state) {
        if (!statusEl) return;
        statusEl.setAttribute('data-status', state);
        var label = statusEl.querySelector('em');
        if (label) {
            label.textContent = state === 'live' ? 'LIVE'
                : state === 'snapshot' ? 'SNAPSHOT'
                : state === 'offline' ? 'OFFLINE'
                : 'SYNC';
        }
    }

    /* ------------------------------------------------------------------ *
     * Draw loop
     * ------------------------------------------------------------------ */
    var lastFrame = 0;
    var rafId = 0;
    var running = false;

    function frame(now) {
        if (!running) return;
        rafId = requestAnimationFrame(frame);
        if (now - lastFrame < 22) return;       // ~45fps cap
        var dt = Math.min((now - lastFrame) / 1000, 0.05);
        lastFrame = now;
        updateRotation(dt, now);
        draw(now / 1000);
    }

    function updateRotation(dt, now) {
        if (!dragging) {
            if (Math.abs(velocity) > 0.0004) {
                rotY += velocity * dt * 60;
                velocity *= Math.pow(0.94, dt * 60);
            } else if (autoRotate && now > resumeAt) {
                rotY += dt * 0.085;
            }
        }
    }

    function draw(t) {
        ctx.clearRect(0, 0, width, height);

        // atmosphere
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 1.32, 0, TAU);
        ctx.fillStyle = haloGradient;
        ctx.fill();

        // sphere body with a soft drop shadow on the light panel
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, TAU);
        ctx.shadowColor = 'rgba(20, 60, 48, 0.18)';
        ctx.shadowBlur = Math.max(10, radius * 0.16);
        ctx.shadowOffsetY = Math.max(3, radius * 0.05);
        ctx.fillStyle = shadeGradient;
        ctx.fill();
        ctx.restore();

        var sinTilt = Math.sin(tilt);
        var cosTilt = Math.cos(tilt);
        var backDots = 0;
        var buckets = [[], [], [], [], [], [], []];
        var i;
        var count = land.length / 3;

        for (i = 0; i < count; i++) {
            var y = land[i * 3];
            var r = land[i * 3 + 1];
            var theta = land[i * 3 + 2] + rotY;
            var x3 = r * Math.sin(theta);
            var z3 = r * Math.cos(theta);
            var y2 = y * cosTilt - z3 * sinTilt;
            var z2 = y * sinTilt + z3 * cosTilt;
            if (z2 <= 0) {
                backDots++;
                continue;
            }
            var sx = centerX + x3 * radius;
            var sy = centerY - y2 * radius;
            var level = Math.min(6, Math.floor(z2 * 7));
            buckets[level].push(sx, sy);
        }

        // back hemisphere: a whisper of volume
        if (backDots) {
            ctx.fillStyle = 'rgba(20, 105, 82, 0.05)';
            for (i = 0; i < count; i++) {
                var by = land[i * 3];
                var br = land[i * 3 + 1];
                var btheta = land[i * 3 + 2] + rotY;
                var bx = br * Math.sin(btheta);
                var bz = br * Math.cos(btheta);
                var by2 = by * cosTilt - bz * sinTilt;
                var bz2 = by * sinTilt + bz * cosTilt;
                if (bz2 > 0) continue;
                ctx.fillRect(centerX + bx * radius - 0.5, centerY - by2 * radius - 0.5, 1, 1);
            }
        }

        // front land dots, bucketed by depth
        for (var level = 0; level < buckets.length; level++) {
            var pts = buckets[level];
            if (!pts.length) continue;
            var alpha = 0.12 + (level / 6) * 0.50;
            var size = 0.8 + (level / 6) * 0.7;
            ctx.fillStyle = 'rgba(20, 105, 82, ' + alpha.toFixed(3) + ')';
            for (i = 0; i < pts.length; i += 2) {
                ctx.fillRect(pts[i] - size / 2, pts[i + 1] - size / 2, size, size);
            }
        }

        // rim
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, TAU);
        ctx.strokeStyle = 'rgba(18, 96, 76, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // visitor cells
        drawVisitorCells(t);
    }

    function drawVisitorCells(t) {
        var keys = Object.keys(cells);
        var i;
        for (i = 0; i < keys.length; i++) {
            var key = keys[i];
            var c = cellCenter(key);
            var latRad = c.lat * Math.PI / 180;
            var p = project(Math.sin(latRad), Math.cos(latRad), c.lon * Math.PI / 180);
            if (p[2] <= 0.02) continue;
            var sx = centerX + p[0] * radius;
            var sy = centerY - p[1] * radius;
            var depth = Math.min(1, p[2] * 1.4);
            var n = cells[key];
            var size = Math.min(28, 8 + Math.log(n + 1) / Math.LN2 * 3.0);
            var alpha = (0.30 + 0.40 * depth) * (0.85 + Math.min(0.15, n / 60));

            // pulse for the busier cells
            if (n >= 3 && !reduceMotion) {
                var phase = (t * 0.55 + (hashKey(key) % 100) / 100) % 1;
                var ringR = size * 0.28 + phase * size * 0.55;
                ctx.beginPath();
                ctx.arc(sx, sy, ringR, 0, TAU);
                ctx.strokeStyle = 'rgba(20, 104, 200, ' + ((1 - phase) * 0.28 * depth).toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.globalAlpha = alpha;
            ctx.drawImage(visitorGlow, sx - size / 2, sy - size / 2, size, size);
            ctx.globalAlpha = 1;

            // white halo + solid blue core reads well on the light globe
            ctx.beginPath();
            ctx.arc(sx, sy, 2.6 + depth * 1.0, 0, TAU);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(sx, sy, 1.4 + depth * 0.9, 0, TAU);
            ctx.fillStyle = 'rgba(11, 99, 197, ' + (0.72 + 0.26 * depth).toFixed(3) + ')';
            ctx.fill();
        }

        // the current visitor
        if (geo) {
            var glat = geo.lat * Math.PI / 180;
            var gp = project(Math.sin(glat), Math.cos(glat), geo.lon * Math.PI / 180);
            if (gp[2] > 0.02) {
                var gx = centerX + gp[0] * radius;
                var gy = centerY - gp[1] * radius;
                var pulse = reduceMotion ? 0.5 : (Math.sin(t * 2.4) + 1) / 2;
                var gsize = 16 + pulse * 6;
                ctx.globalAlpha = 0.48 + 0.18 * gp[2];
                ctx.drawImage(youGlow, gx - gsize / 2, gy - gsize / 2, gsize, gsize);
                ctx.globalAlpha = 1;

                // pulsing target ring
                ctx.beginPath();
                ctx.arc(gx, gy, 6 + pulse * 4.5, 0, TAU);
                ctx.strokeStyle = 'rgba(217, 96, 10, ' + ((1 - pulse) * 0.30).toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(gx, gy, 4.4, 0, TAU);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(gx, gy, 4.0, 0, TAU);
                ctx.strokeStyle = 'rgba(217, 96, 10, 0.90)';
                ctx.lineWidth = 1.4;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(gx, gy, 1.7, 0, TAU);
                ctx.fillStyle = '#e0660d';
                ctx.fill();
            }
        }
    }

    function hashKey(key) {
        var h = 0;
        for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff;
        return h;
    }

    /* ------------------------------------------------------------------ *
     * Interaction
     * ------------------------------------------------------------------ */
    function bindPointer() {
        var lastX = 0;
        var lastY = 0;
        var lastT = 0;

        canvas.addEventListener('pointerdown', function (e) {
            dragging = true;
            velocity = 0;
            lastX = e.clientX;
            lastY = e.clientY;
            lastT = performance.now();
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        });

        canvas.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var now = performance.now();
            var dx = e.clientX - lastX;
            var dy = e.clientY - lastY;
            rotY += dx * 0.007;
            tilt = Math.max(-0.75, Math.min(0.95, tilt + dy * 0.004));
            var dt = Math.max(1, now - lastT);
            velocity = (dx * 0.007) / (dt / 16.7);
            lastX = e.clientX;
            lastY = e.clientY;
            lastT = now;
        });

        function release() {
            if (!dragging) return;
            dragging = false;
            resumeAt = performance.now() + 2200;
        }

        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
        canvas.addEventListener('pointerleave', function (e) {
            if (dragging && e.buttons === 0) release();
        });
    }

    /* ------------------------------------------------------------------ *
     * Boot
     * ------------------------------------------------------------------ */
    function start() {
        land = decodeLand(LAND_B64);
        resize();
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function () {
                if (Math.abs(canvas.clientWidth - width) > 1) {
                    resize();
                }
            });
            ro.observe(canvas);
        } else {
            window.addEventListener('resize', resize);
        }
        bindPointer();
        loadCache();
        updateStats();
        setStatus('sync');

        var pageVisible = !document.hidden;
        var onScreen = true;

        function startLoop() {
            if (running || !pageVisible || !onScreen) return;
            running = true;
            lastFrame = performance.now();
            rafId = requestAnimationFrame(frame);
        }

        function stopLoop() {
            running = false;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
        }

        document.addEventListener('visibilitychange', function () {
            pageVisible = !document.hidden;
            if (pageVisible) startLoop(); else stopLoop();
        });

        if (typeof IntersectionObserver !== 'undefined') {
            var io = new IntersectionObserver(function (entries) {
                onScreen = entries[0].isIntersecting;
                if (onScreen) startLoop(); else stopLoop();
            }, { threshold: 0.01 });
            io.observe(canvas);
        }

        startLoop();

        loadSnapshot().then(function () {
            updateStats();
            if (!mqtt.subscribed) setStatus(snapshotReady ? 'snapshot' : 'offline');
        });

        locate().then(function () {
            if (session.loc) geo = session.loc;
            updateYou();
            if (mqtt.subscribed) mqttAnnounce();
        });

        mqttConnect();
        setStatus('sync');
    }

    try {
        start();
    } catch (e) {
        /* never break the page because of the decorative globe */
        if (window.console && console.warn) console.warn('visitor globe failed', e);
    }
})();
