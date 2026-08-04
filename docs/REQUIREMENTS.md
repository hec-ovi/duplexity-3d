# REQUIREMENTS (Hector's words, raw, in order)

Appended verbatim as they are given, so none gets lost. Interpretation lives in the design docs
and the contracts; this file is the record of what was actually asked for.

---

## 2026-08-04 - Skill + toolkit, city levels, roguelike map state, voice keys

> tts and sst is solved with an api key using fish pro something check smiulacrunium parent, use
> that one. check all is working in here i want a tool and skill inside this project, so this must
> be used as an agentic skill + toolkit for generating dynamics levels, etc, wityh dynamics npcs
> etc, check research-skill and websearch-skill see maybe skill.md should be repeated in many
> places, etc. the end product should be a level creator with doors, and an exit, an entry point
> and an exit, can have buildings, with many floors, inside view of each floor (so think of
> blueprints) so i want a specific tool to do streets, then buildings, then houses, and each can be
> an instance, i want a general masp state like what were unlocked, and all unlocked instances for
> open the exit of the rogue, remember tyhis is a rogue, so once you unlocked all instances or
> whatever, you should be able to exit and win. easy asd that. special focus on how to make the map
> correct, here is a similar project you might learn, but do not copy, understand how the guy
> managed, because this one is not first/third person as what we want is always top view i think,
> and also... i dont know check it out tho
> https://github.com/majidmanzarpour/threejs-procedural-dungeon <- because is not a city is a
> dungeon i think.

> also this procject i think does not have the contract and box approach and it should, be sure
> once you start doing that too

Answers to the three questions that came out of the above:

- Camera: "i said THE EXAMPLE uses top view, we want first person walking instead."
- Inside a building floor: "Only what you have walked into" (rooms stay hidden on the blueprint
  until entered, then stay revealed).
- Player voice: "Type to talk, listen to replies" (Fish TTS speaks NPC lines; the player types).
