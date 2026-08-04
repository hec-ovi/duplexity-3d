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

## 2026-08-04 (later) - Open world outside, block model, look and feel

> okey is very good, but think of a mode where we have streets as well, more open world, now looks
> liek a dungeon, i mean is excellent as-is, but some details: when i discover a new room, the minimap
> "additionate" new rooms, should simply put me on the actual room and thats it. and the open world
> part, where we can join other instances, all are walls... remember this is an open world, so not
> necesarry all is clock and rooms after rooms, could be streets, so like.. boxes that are buildings
> with their instances.. now it looks i am ALREADY on an instance, this is correct for a single
> building for example, like a big gallery... but the superior level, should be an open world instead,
> so kind of.. instead walls and doors after doors, boxes with empty spaces which are streents, and a
> boundarty that limits it of course, but that boundady sohuld be empty space just not walkable.. this
> way buildings with elevators and multiple levels are tlal, etc

> as i can see when i exit ashgate i see the whole building that is correct actually, we just need on
> the outside, streets

> i made screenshots of how it look,s and in downloads you can sewe the expected image... see how far
> we are, made 3 in downloads so you see

> do not abuse neons, etc, but keep the idea, of: streets with textures, walk zones for NPCs, and
> buildings, the idea is our tool has the next: different buildings, a block, with different buildings
> and walk zones, so each block can be special or in some cases similar... think of it holistically and
> as i said a sboxes, so, streets are ont thing and the walk over "veredas" like on the block peaton
> parts peasant parts, is different, streets are other thing, and builders from outside have different
> shapes, and things, and inside they are their instances of course

> for text, DO NOT USE TEXT ON THE THREEJS DIRECT! use instead, a ui overlay, will be easier, much
> more intuitive

> okey thats better, just have in count, you are putting a single box/building per block, in general
> blocks have different buildings, and houses, or places... and street where people walk is too small
> as well

> aldo why glb...? glb is not for npcs? what we need is textures i think, not exacly glbs... we are far
> away from glbs wiych are cars, bikes, people, or objects like i dont know those lights for cars stop
> signals etc... but street and places where people walk and modelling of the buildings should be
> unique and we should be able to do it

> so, this is a skill? right not "fixed" so each generation with the skill you should easily build a
> city with different structures on it and instances, and THEN you should be able also to customize
> others, correct? thinkn of this skill also as multi agent so an agent can create a specific build for
> specific things, also make some buildsa unaccessible meaning no access door, you understand? but good
> modeling so maybe the quest is in a specific block street

> also think a save checkpoint of a city we like, so a load thing also is a good feature we want. you
> have green light, go ahead, make deep work on lighting as well i will provide other screenshots from
> someone that did a street on threejs, he even uses videos inside the buildings, has lights and stuff,
> made tons of screenshots, read all of them inside screenshots folder, lighting we will need so find a
> way block have their lights, reflections, etc we want, raining no need, but some water parts could
> be, as a parameter. lighting is too neon and saturated on the image but is fine, fidugre out the
> buildings to do them with those details, in the end is just modeling like balconys windows, etc, and
> "carteles" like neon ones, and some videos, i would recommend also small tiny skills for each small
> part, like add balconies and create specific ones, custom made, with cartels and etc.. so in away most
> of those are repeated features with tiny variances, you understand? this will give a vivid feeling,
> our win is dinamism, but we want the realism as good as possible, if you need specific textures, feel
> free to check from public domain for this kind of things like concrete, etc. you have green light to
> research, explore, and implement

## 2026-08-04 (later still) - Doors, interiors, textures, signage

> much better, very... VERY good direction. now render does not have the style i provided yet,
> lights, etc. the textures of the building are like randomly repeated, doors, etc do not seem real,
> meaning a door should be a box, like real door, improve texture grid in general respecting this, so
> each build is special and well textured on its space. think in future each might even have unique
> textures. when i exit a place i exit like from behind, i should exit from main door. i do not see
> balconies and the neon texts are not there, like building letters explaining what is each. the UI
> text of the ncps should not be stick to the player but floating, like a normal ui simple as that.
> but overall excellent progress. improve light quality, reflections, etc you were able to replicate
> what i provided as samples in other scenes so is possible for sure.

> rooms are too small, exits are hard to find, i saved some images for guide of how rooms should be,
> also when i join a place, i appear in front of exit door (which should say exit), and almost like if
> i have w i exit immediately. It is better overall, but still needs more love, textures, etc.
> asphalt, etc have no textures, compare the original ones we made are not like that... for buildings
> balconies, and details check reference: Screenshot From 2026-08-04 12-10-07, for asplhalt texture
> and material check this Screenshot From 2026-08-04 12-10-00 <thats street, for interior
> schematic/blueprint: cyberpunk-interiors-3d-models-and-materials-apartments <similar like that,
> think of a same thing you did? but for places, so... make normal hauses have kichen, living room,
> bathroom, etc. another interior javier-pintor-apart-7a. thuis is your actual interior: Screenshot
> From 2026-08-04 13-45-13 <no roof texture, poor spaces, poor lighting, no correct blueprint, etc.
> Screenshot From 2026-08-04 13-52-02 <letters and top things over them collapse, finx a way to
> improve that, so it have sense. walls are poorly textured.. make a research of public domain
> textures for aslphalts, walls, different materials, and use those

> lights turn off and on depending on distance, think it is a bug...

> check last screenshot, the door is not a door, the floor is too perfect, and the walls look cartoon
> with rectangular textures., places inside look like dungeons, very ugly overall, i sent you pictures
> of examples, and doors to other places such as rooms etc should also have letters over them. hold
> shift should run, space should jump, right click should zoom, and ver are far from the images i
> provided as examples, the streets now are better i like those textures. but the rest needs big
> improvements still, i also do not see shadows, or reflections, etc looks too cartoonish compared to
> the provided examples

> rooms and places inside are extremely small still

> check last screenshot how it looks... like over the texture of windows, etc all windows look the
> same, etc. i would recommend put windows as different obhects, and they have their own tesxture not
> a single texture over a whole building

> still issues with those parts over the doors, as screenshot shows, and as you see the other
> screenshot buildings have still those geeneric like windows... we wont worry about inside rooms
> yet.. look.. FOCUS ON EXCEL IN TEXTURES, and th eoutside as the main provided images, you managed
> to do this in other projects, you should be able to make it in here as well, i am trying to provide
> you advice on how...is getting better but i have the feeling you are rushing or not paying
> attention.. to show some shining fake stuff. look... doors? they only have the frame now, they
> should be an object excluded from the bulding. top letters? should be over the doors, and different
> ones, dynamic as possible but the positions should be relative to the rest, windows? they are all
> the same size, and same type... what do we want? variations, of windows, balconies, doors, letters,
> and lights on the streets, so we do variations of models, and real correct ones. all this musy be
> flexible and dynamic, this means, if we want to do only 4 blocks we should be able to. and the LLM
> generating it should just provide "x" blocks and "x" functional buldings with whatever label theyt
> want, so they can do the quests. there is a click to play thing floating always there. the feeling
> i have is now, is like minecraft, poor cartoonish style. the scene i showed to you is cinematic and
> hyper realistic. found something might HEAVILY help you, on the buildings at least, this one looks
> AMAZING https://jeff-beene.com/portfolio/synthcity/ and its open source code:
> https://github.com/jeffbeene/synthcity and the one i want (that one is macro) the micro one should
> be like this: https://threejspunk.vercel.app/ however the first one you might get glbs or whatever
> from buildings, etc check it outr, it has a lot of things, is like blade runner and cyberpunk, so
> learn aobut it, and see how we can use it... now... once you do that please take a time to organize
> the code correclty, you know contracts md and make it lean and box based. remember the goal is:
> ytou have places you go, speak with an npc, once you do few missions just talking basically, the
> game ends, super easy, and the idea llms can prompt those locations, so a city can be super big,
> but directions to go and interact are specific places, and whose are inside inner, etc as you sdaid
> for now the inside poorly because have no realinteriors

> most of micro level you did i really like it this means, buildings have spaces between i can walk,
> they are distinct with dinwods, and doors, they have letters. however the street distances, and the
> buildings like being tall, realistic, etc is not present, in the sample i sent to you this is fixed.

> the trick will be, how you will solve the micro part...? the one i shown you is first, very old
> repo like 3 years, and is like a ship you move, now... if you can make like travel? then better even
> so is much more immersive

> doors still, INSIDE the frame they are like transparentg, if you fix that we will make a huge
> improvement

> all the lighting and the amazing city the dude did in the example i do not see it, all the holo
> things, big buildings, etc

> chgeck last screenshots, some elements are like floating, etc.. so something on generation is kind
> of not okey... the sampel he did has like a space ship that flys and you see from top lot of
> skybuildings, M,ANY of them very tall, amazing colors and lights, some olographic buildings... like
> trails on the air... vehicles flying... is like alive/vivid

> also i saw a female hologram in one of the buildings and those like train paths on the city, and
> multiple buildings, etc the guy he probably did some sort of script to do all that dynamically

> okey, first, extremely low performance, something happened, sceond i will show you 2 images,
> actyaully did more this is yours: Screenshot From 2026-08-04 15-17-28 and the other ones is him...
> can you check it?

> check the shapes of the buildings, and is extremely high speed, the render super speed super
> performant, and i gavbe you the full repo actually... the repo takes some time to generate the whole
> thing but works good

> is crazy because i keep moving forward and keeps generating, is infinite...

> i made even more screenshots, it has like holo arround some buildings.. etc

> the code is the open source i shared and is free license mit to use i saw it so

> check last screenshots is close up to streets

> also check the last screenshot has the menu, that menu should be the like dialogs i want for npcs
> the ui

> what i would do: keep the streets as we use that texture is nice, but the "veredas" use that cyan
> material he uses, and best effort is.. on the streets? because it seems all this is auto generated
> on his repo so... tghats good one side but bad, how we do our custom rooms and doors right? so if
> you can detect "some" buildings, easy ones, we use ours in those, so we simply inject some of the
> buildings our onw, the others can be totally fake..., think the map should have a marker, where
> points direction to where to go, 34 places is too much make it like top... 6, 7 places only, far
> from each others

> all this should be parameter based

> right, and whatever he did modernize it, is like 3 years old, probably can be optimized and highly
> improved overall, probably he does not have fiber or all those things.

> he uses a specific texture light tone, etc, check what that is.. so improve it overall

> also you did put some random leters look very bad, i guess that will go now.. but just to let you
> know...

> proceed and implement every single missing feature, tell me once all is as i asked.
