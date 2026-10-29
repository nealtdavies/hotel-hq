'use strict';
/* ================= The questions and puzzles for the crisis word and order games (no DOM access) =================
   Kept apart from the rules in engine-crises.js so the wording can be changed without touching them.

   WORDS: for each word game, four questions. Every question has three answers, scored 2 (best), 1 (will do, but misses something) and 0
   (unhelpful, rude, unsafe or untrue). The game shuffles the answers. A good answer is calm, clear, truthful and gives the facts the other
   person needs; a weak one is vague, panicky, makes excuses, blames someone or pressures a guest. How long an answer is does NOT tell you
   whether it is good: across each game the best answer is sometimes the longest, sometimes the shortest and sometimes in between,
   and tests/simulate.js checks that this stays true. Writing is kind and plain, and nothing here is about anyone being hurt.
   ORDERS: for each order game, four puzzles of four or five steps, each with only one sensible order.
   {hotel} in a sentence is replaced by the hotel's name. */
const q = (prompt, best, ok, bad) => ({ prompt, options: [{ t: best, score: 2 }, { t: ok, score: 1 }, { t: bad, score: 0 }] });

const CRISIS_WORDS = {
  'pipe.plumber': [
    q('The plumber answers. What do you tell them?',
      'A pipe has burst above the guest rooms and the water is off at the valve. Please come today.',
      'Oh no, there is water everywhere and it keeps coming through the ceiling and the carpets are soaked and I do not know what to do, please hurry!',
      'Something is a bit wet. Come when you can.'),
    q('The plumber asks you to describe the leak.',
      'Above the guest rooms. The main valve is shut.',
      'It is a big leak, and it is getting worse. I think it is coming from upstairs.',
      'Well, it is hard to say. It might be one pipe or another, or maybe the roof, and one guest said it was the radiator, so who knows really?'),
    q('The plumber asks whether the area is safe to work in.',
      'Yes. We have kept guests away, switched off the power to that corridor and put out a wet-floor sign.',
      'Yes, we put a sign out.',
      'No idea.'),
    q('The plumber asks how soon you need them.',
      'As soon as you can, please. Water is still coming through and there are guests in the rooms below.',
      'Today would be good, thank you.',
      'Whenever.')
  ],
  'power.phone': [
    q('The power company answers. What do you say?',
      'The whole hotel has lost power and we have guests. When will it be back?',
      'Hello? Our lights are out. Can you send someone to have a look at it when you get a minute?',
      'Fix our power right now! This is the worst service I have ever had and I am going to tell everybody about it and write a terrible review!'),
    q('They ask whether you have checked your own fuse box.',
      'Yes, we have, and it is fine. The whole street seems to be dark. How long will it take?',
      'I think so. Can you just send someone?',
      'That is not our job, that is yours.'),
    q('The operator asks for the address of the hotel.',
      '{hotel}. I can give you the full address and a number to call us back on.',
      'It is the big hotel by the sea, you cannot miss it, everybody knows where we are and I am sure your engineers have been here before.',
      'Look it up yourself.'),
    q('The operator asks if anyone needs special help in the dark.',
      'Yes, an older guest is on the top floor. We are taking them a torch and a member of staff.',
      'Everyone is fine, I think, we have not really checked, and there are quite a lot of people here at the moment.',
      'No.')
  ],
  'mice.pest': [
    q('Pest control asks what you have seen.',
      'A mouse near the kitchen door and crumbs by the storeroom. We have closed the kitchen.',
      'I think I saw something small run past and I am pretty sure it was a mouse, but I did not get a good look at it.',
      'Nothing really.'),
    q('They ask where the food is kept.',
      'In the storeroom next to the kitchen. It is locked now and we have moved the open packets.',
      'In the kitchen somewhere.',
      'I do not know. Ask the chef.'),
    q('They ask when you first noticed the problem.',
      'This morning. The chef found a gnawed packet.',
      'A little while ago, I think, although it could have been longer, because nobody has really been keeping track of it.',
      'It is not a problem. Mice are normal in kitchens, so you do not need to come.'),
    q('They ask what you have done so far.',
      'We closed the kitchen and covered the food.',
      'We have been quite busy and have mostly been thinking about what to do and talking about it a lot with the team.',
      'It is only mice, so we have done nothing about it. They will probably go away by themselves, they always do.')
  ],
  'roof.roofer': [
    q('The roofer asks how bad the leak is.',
      'Tiles are off above two rooms. It is covered for now.',
      'The roof is leaking quite badly and the rain keeps coming in, and it seems to be getting worse as the storm goes on.',
      'It is only a few drips, no rush, so come whenever you are free next week.'),
    q('The roofer asks if anyone can get onto the roof safely.',
      'Yes, there is a hatch on the top floor. Please bring your own ladder and we will keep guests clear.',
      'I think there is a way up.',
      'Just climb up, you will find it.'),
    q('The roofer asks what the weather is like.',
      'Very windy with heavy rain. Please only come if it is safe for you.',
      'Quite bad, to be honest, really quite stormy, and I think it might be even worse later this afternoon according to the news.',
      'Fine.'),
    q('The roofer asks which rooms are affected.',
      'Two top-floor rooms. We have moved the guests and put buckets under the drips.',
      'Some of the top rooms, I think.',
      'All of them.')
  ],
  'gossip.reply': [
    q('A guest has written an unkind review. Which reply is best?',
      'Thank you for telling us, and we are sorry we let you down. We would love to put it right, so please get in touch.',
      'Thank you for your review.',
      'That is not true and you are wrong.'),
    q('Another guest says the room was noisy. How do you reply?',
      'Sorry about the noise. Please come back and we will find you a quieter room.',
      'Thank you for your feedback. We try to make sure all of our rooms are quiet and comfortable, and we will pass your comments on to the team.',
      'Other guests did not complain, so it must have been something you did, and maybe next time you should choose a different hotel.'),
    q('A guest says breakfast was cold. What do you write?',
      'We are sorry your breakfast was cold. We have spoken to the chef and would like to make it up to you.',
      'Sorry about that.',
      'Breakfast is always hot. Perhaps you waited too long to eat it, and we were very busy that morning because lots of guests came at once.'),
    q('A guest wrote a lovely review. How do you reply?',
      'Thank you so much for your kind words. We are delighted you enjoyed your stay and hope to welcome you back soon.',
      'Thanks.',
      'About time somebody said something nice for a change.')
  ],
  'gossip.ask': [
    q('A guest is checking out smiling. How do you ask for a review?',
      'We are so glad you enjoyed your stay. If you have a moment, would you tell others about it?',
      'It would be really great if you could possibly find the time to write a review for us sometime, if you want to, but only if you have time.',
      'You must write a five-star review before you go.'),
    q('A family says they loved the pool. What do you say?',
      'That is lovely to hear! Would you mind sharing that in a review so other families can find us?',
      'Great. Review us.',
      'Then you owe us a review.'),
    q('A guest thanks the receptionist. What do you do?',
      'Say thank you, and ask if they would share it in a review.',
      'Smile and say nothing about reviews, and hope that they think of it by themselves when they get home later on.',
      'Tell them the hotel gets bad reviews unless every guest writes a good one, so they must help or it will be their fault.'),
    q('A guest had one small problem that was fixed quickly. Do you ask for a review?',
      'Yes, kindly. Say you are glad it was sorted and ask if they would share how it went.',
      'Not this time.',
      'Yes, and tell them they can only give a high score because you fixed it fast, so anything else would not be fair.')
  ],
  'lift.engineer': [
    q('The lift engineer answers. What do you tell them?',
      'The lift has stopped between floors one and two. Guests are inside and safe.',
      'The lift is broken, please come quickly, I think there are a few people stuck inside it and they are starting to get worried.',
      'It is a bit stuck. Come if you are passing, or whenever is convenient, there is no great hurry at all.'),
    q('The engineer asks if you have switched the lift off.',
      'Yes, it is switched off at the control panel and a member of staff is at the lift doors.',
      'I think somebody did that.',
      'No, we thought you would do that.'),
    q('The engineer asks how many people are inside.',
      'Three: two adults and a child. We can talk to them through the doors and they are calm.',
      'Quite a few, it is hard to tell from out here, and they keep talking at the same time so I cannot count them properly.',
      'None.'),
    q('The engineer asks whether anyone needs help.',
      'Nobody is hurt. A child is scared, so we are keeping them talking.',
      'We think everyone is okay but we have not really been able to ask them all, because the doors are shut and it is quite noisy.',
      'They will be fine. People get stuck in lifts all the time, so there is no need to worry about it or do anything special.')
  ],
  'lift.talk': [
    q('The guests in the lift are worried. What do you say through the doors?',
      'Please do not worry. You are safe, help is on its way, and I will stay right here and talk to you until the doors are open.',
      'Someone is coming soon.',
      'There is nothing I can do. Just wait.'),
    q('A child in the lift asks how long it will take.',
      'Not long. Shall we play a guessing game?',
      'I am not sure how long it will take, but the engineer is on the way and we are doing everything we can to help.',
      'Ages. Lifts like this can take hours to fix, so you had better get comfortable.'),
    q('An older guest in the lift says it feels hot. What do you say?',
      'I am sorry it is warm. Please sit down, and slow deep breaths will help.',
      'Try not to think about it, it will pass, and anyway it is only a little bit hot in there so you will be fine for ages.',
      'It is not that hot, so stop making a fuss about it, you are only making things worse for everybody in there.'),
    q('A guest in the lift says they are late for dinner. How do you answer?',
      'I am very sorry. We will keep your table for you, and the restaurant knows you are on your way.',
      'Dinner will have to wait, I am afraid, but I really cannot say for how long it will be, because I just do not know and there is not much I can do about it.',
      'That is your problem.')
  ],
  'pool.specialist': [
    q('The pool specialist asks what is wrong with the pool.',
      'The water has gone green and cloudy, there are leaves on the surface, and the filter is making a grinding noise. We have closed the pool.',
      'The pool looks dirty.',
      'It is fine really. Just a quick look.'),
    q('They ask when the chemicals were last checked.',
      'Two days ago. The readings were normal then, so something has changed quickly.',
      'Quite recently, I think, although it might have been a few days ago, or perhaps last week, because the notes are somewhere in the office.',
      'I have no idea. We never write it down.'),
    q('They ask if the pool has been used a lot.',
      'Yes, it was busy at the weekend, with lots of children.',
      'It has been used quite a bit, I believe, although I could not tell you exactly how many people, since we do not count them.',
      'The pool is never used. Nobody swims here, so I cannot think why it would be dirty at all, it must be your fault.'),
    q('They ask whether the pool is safe to use right now.',
      'No. We have closed it, put up signs and told every guest, and nobody will swim until you say it is safe.',
      'It is closed.',
      'Yes, people can still swim, the water is only a little green and it will not hurt anybody.')
  ],
  'lock.locksmith': [
    q('The locksmith asks about the door.',
      'It is a guest room door on the first floor. The key goes in but will not turn, and nobody is inside.',
      'It is one of the doors upstairs and it will not open properly, I think it is probably something to do with the lock but it could be the door.',
      'I do not know which door. Come and find it.'),
    q('The locksmith asks if you have tried the master key.',
      'Yes, and it will not turn either, so I think the lock itself has jammed. Please bring a new one.',
      'I think so.',
      'No, we do not have one.'),
    q('The locksmith asks if the door is damaged.',
      'No damage. The key goes in but will not turn.',
      'It looks fine from the outside, but we have not looked very closely, and the door has been a bit odd for a while now.',
      'We kicked it a few times to open it, so there may be a few marks and a crack or two, but that is probably normal.'),
    q('The locksmith asks whether a guest is locked out.',
      'Yes, a guest is waiting in the lobby with a cup of tea. Their things are inside the room.',
      'There is somebody waiting somewhere, and I think they are quite annoyed about it, but I am not sure where they are at the moment.',
      'No.')
  ]
};

const CRISIS_ORDERS = {
  'power.barbecue': [
    { prompt: 'Put the barbecue steps in the right order.', steps: ['Check the charcoal and light it', 'Wait until the coals glow', 'Cook the food on the grill', 'Serve it hot with a smile'] },
    { prompt: 'Put the steps in the right order.', steps: ['Clean the grill', 'Light the coals', 'Cook the food until it is ready', 'Carry it safely to the tables'] },
    { prompt: 'Put the steps in the right order.', steps: ['Wash your hands and put on an apron', 'Set up the grill and add charcoal', 'Light the coals and wait until they glow', 'Cook the food until it is ready', 'Serve it hot with a smile'] },
    { prompt: 'Put the steps in the right order.', steps: ['Check the grill is steady and away from walls', 'Light the coals', 'Put the food on once the coals are glowing', 'Turn the food so it cooks evenly', 'Check it is cooked all the way through'] }
  ],
  'pool.chemicals': [
    { prompt: 'Put the pool-cleaning steps in the right order.', steps: ['Test the water', 'Add the right chemicals', 'Run the filter for a few hours', 'Test the water again'] },
    { prompt: 'Put the steps in the right order.', steps: ['Skim off the leaves', 'Test the water', 'Treat the water', 'Check it is safe to swim'] },
    { prompt: 'Put the steps in the right order.', steps: ['Put on gloves and goggles', 'Test the water', 'Add the chemicals slowly', 'Run the filter', 'Test the water again'] },
    { prompt: 'Put the steps in the right order.', steps: ['Close the pool and put up a sign', 'Skim off the leaves', 'Brush the sides and bottom', 'Treat the water', 'Open the pool again when it is safe'] }
  ],
  'lock.keys': [
    { prompt: 'Put the steps in the right order.', steps: ['Check the room number on the door', 'Find the right tag in the key cabinet', 'Try the master key gently', 'Open the door and check the room'] },
    { prompt: 'Put the steps in the right order.', steps: ['Ask the guest which room it is', 'Open the key cabinet', 'Take out the master key', 'Try it in the lock'] },
    { prompt: 'Put the steps in the right order.', steps: ['Say sorry to the guest for the wait', 'Ask which room it is', 'Find the key tag for that room', 'Check the number matches', 'Hand over the key with a smile'] },
    { prompt: 'Put the steps in the right order.', steps: ['Try the key gently', 'If it sticks, do not force it', 'Ask maintenance to come and look', 'Keep the guest comfortable while you wait', 'Open the door together once it is fixed'] }
  ]
};
