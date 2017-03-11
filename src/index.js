var Alexa = require('alexa-sdk');
var request = require('superagent');
var utils = require('util');

var states = {
    SEARCHMODE: '_SEARCHMODE',
    DESCRIPTION: '_DESKMODE'
};
// local variable holding reference to the Alexa SDK object
var alexa;

var gymID = process.env.MICO_ID;

//OPTIONAL: replace with "amzn1.ask.skill.[your-unique-value-here]";
var APP_ID = undefined;

// Skills name
var skillName = '<say-as interpret-as="interjection">Boom.</say-as> you gym rat. ';

// Message when the skill is first called
var welcomeMessage = "Alright, which day? ";

// Message for help intent
var helpMessage = "Try saying: Tomorrow? What classes are there on this Tuesday?";

var UnhandledMessage = "Looks like I didn't quite get that. ";

var descriptionStateHelpMessage = "Here are some things you can say: Tell me about class one";

// Used when there is no data within a time period
var NoDataMessage = "Sorry there aren't any classes scheduled. Would you like to search again?";

// Used to tell user skill is closing
var shutdownMessage = 'Ok have fun at the gym. <say-as interpret-as="interjection">Arrivederci.</say-as>';

// Message used when only 1 class is found allowing for difference in punctuation
var oneEventMessage = "There is 1 class ";

// Message used when more than 1 class is found allowing for difference in punctuation
var multipleEventMessage = "There are %d classes ";

// text used after the number of classes has been said
var scheduledEventMessage = "on %s. ";

var firstFiveMessage = "Here are the first %d. ";

// the values within the {} are swapped out for variables
var classSummary = "%s is at %s with %s. ";

// Only used for the card on the companion app
var cardContentSummary = "%s at %s with %s\r\n";

// More info text
var haveClassesRepromt = "Ask for another date or give me an class name to hear more information.";

// Error if a date is out of range
var dateOutOfRange = "Date is out of range please choose another date";

// Error if a class number is out of range
var classOutOfRange = "Sorry. I didn't recognize the class name.";

// Used when an class is asked for
var descriptionMessage = "Description for %s: %s";

var classNumberMoreInfoText = "You can search another date, hear more classes, or ask to hear more about a specific class.";

// used for title on companion app
var cardTitle = "Classes";

// output for Alexa
var output = "";

// stores classes that are found to be in our date range
var relevantClasses = new Array();
var classList = new Array();
var maxNumberToReadOut = 5;
var nextIntentIndex;

// Adding session handlers
var newSessionHandlers = {
    'LaunchRequest': function () {
        this.handler.state = states.SEARCHMODE;
        this.emit(':ask', skillName + " " + welcomeMessage, welcomeMessage);
    },
    "searchIntent": function()
    {
        this.handler.state = states.SEARCHMODE;
        this.emitWithState("searchIntent");
    },
    'Unhandled': function () {
        this.emit(':ask', unhandledMessage, unhandledMessage);
    },
};

// Create a new handler with a SEARCH state
var startSearchHandlers = Alexa.CreateStateHandler(states.SEARCHMODE, {
    'AMAZON.YesIntent': function () {
        output = welcomeMessage;
        alexa.emit(':ask', output, welcomeMessage);
    },

    'AMAZON.NoIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'AMAZON.RepeatIntent': function () {
        this.emit(':ask', output, helpMessage);
    },

    'searchIntent': function () {
        // Declare variables
        var dateSlotValue = this.event.request.intent.slots.date.value;
        if(this.event.request.intent.slots.classTime != undefined){
          var timeSlotValue = this.event.request.intent.slots.classTime.value;
        }
        if (dateSlotValue != undefined)
        {
            var parent = this;
            weekDates = getWeekDates();
            // Using the iCal library I pass the URL of where we want to get the data from.
            request
            .get('https://mico.myiclubonline.com/iclub/scheduling/classSchedule.htm?club='+gymID+'&lowDate='+weekDates[0]+'&highDate='+weekDates[1])
            .end(function(err, res){
              console.log("Number of classes retrieved " + res.body.length);

              classList = res.body;
              for(var j = 0; j < classList.length; j ++){
                var instructorNames = classList[j].employeeName.split(' ');
                classList[j].instructor = instructorNames[0];
              }
                // Check we have data
                if (classList.length > 0) {
                    // Read slot data and parse out a usable date
                    var classDate = getDateFromSlot(dateSlotValue);
                    // Check we have both a start and end date
                    if (classDate.startDate && classDate.endDate) {
                        // initiate a new array, and this time fill it with classes that fit between the two dates
                        relevantClasses = getClassesBeweenDates(classDate.startDate, classDate.endDate, classList);

                        if (timeSlotValue != undefined)  {
                          relevantClasses = filterTime(timeSlotValue, relevantClasses);
                        }

                        if (relevantClasses.length > 0) {
                            // change state to description
                            parent.handler.state = states.DESCRIPTION;

                            var relevantClassResponse = buildRelevantClassResponse(relevantClasses, dateSlotValue);
                            alexa.emit(':askWithCard', relevantClassResponse.output, haveClassesRepromt, cardTitle, relevantClassResponse.cardContent);
                        } else {
                            output = NoDataMessage;
                            alexa.emit(':ask', output, output);
                        }
                    } else {
                        output = NoDataMessage;
                        alexa.emit(':ask', output, output);
                    }
                } else {
                    output = NoDataMessage;
                    alexa.emit(':ask', output, output);
                }
            });
        }
        else {
            this.emit(":ask", "I'm sorry.  What day did you want me to look for classes?", "I'm sorry.  What day did you want me to look for classs?");
        }
    },

    'AMAZON.HelpIntent': function () {
        output = helpMessage;
        this.emit(':ask', output, output);
    },

    'AMAZON.StopIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'AMAZON.CancelIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'SessionEndedRequest': function () {
        this.emit('AMAZON.StopIntent');
    },

    'Unhandled': function () {
        this.emit(':ask', helpMessage, helpMessage);
    }
});

// Create a new handler object for description state
var descriptionHandlers = Alexa.CreateStateHandler(states.DESCRIPTION, {
    'searchIntent': function () {
      var dateSlotValue = this.event.request.intent.slots.date.value;
      if(this.event.request.intent.slots.classTime != undefined){
        var timeSlotValue = this.event.request.intent.slots.classTime.value;
      }

      if (classList.length > 0) {
          // Read slot data and parse out a usable date
          var classDate = getDateFromSlot(dateSlotValue);
          // Check we have both a start and end date
          if (classDate.startDate && classDate.endDate) {
              // initiate a new array, and this time fill it with classes that fit between the two dates
              relevantClasses = getClassesBeweenDates(classDate.startDate, classDate.endDate, classList);

              if (timeSlotValue != undefined)  {
                relevantClasses = filterTime(timeSlotValue, relevantClasses);
              }
              if (relevantClasses.length > 0) {
                  // change state to description

                  var relevantClassResponse = buildRelevantClassResponse(relevantClasses, dateSlotValue);
                  alexa.emit(':askWithCard', relevantClassResponse.output, haveClassesRepromt, cardTitle, relevantClassResponse.cardContent);
              } else {
                  output = NoDataMessage;
                  alexa.emit(':ask', output, output);
              }
          } else {
              output = NoDataMessage;
              alexa.emit(':ask', output, output);
          }
      } else {
          output = NoDataMessage;
          alexa.emit(':ask', output, output);
      }
    },
    'nextIntent': function () {
      var output = "";
      var howManyMoretoRead = relevantClasses.length > (maxNumberToReadOut + nextIntentIndex) ? (maxNumberToReadOut + nextIntentIndex) : relevantClasses.length;
      for(var m = nextIntentIndex; m < howManyMoretoRead; m++){
        if (relevantClasses[m] != null) {
            output += utils.format(classSummary, relevantClasses[m].eventName, relevantClasses[m].eventStartTime, relevantClasses[m].instructor);
        }
      }
     nextIntentIndex = howManyMoretoRead; // update the next function

      output += classNumberMoreInfoText;
      alexa.emit(':ask', output, output);
    },
    'classIntent': function () {

        var repromt = " Would you like to hear about another class?";
        var slotValue = this.event.request.intent.slots.className.value;

        var availableClasses = new Array();
        for (var k = 0; k < relevantClasses.length; k++) {
          if (relevantClasses[k].eventName.toLowerCase() == slotValue) {
            availableClasses.push(relevantClasses[k]);
            console.log(slotValue);
          }
        }

        if(availableClasses.length > 0) {
            output = utils.format(descriptionMessage, availableClasses[0].eventName, availableClasses[0].eventDescription);

          this.emit(':askWithCard', output, repromt, availableClasses[0].eventName, availableClasses[0].eventDescription);

        } else {
            this.emit(':tell', classOutOfRange);
        }
    },

    'AMAZON.HelpIntent': function () {
        this.emit(':ask', descriptionStateHelpMessage, descriptionStateHelpMessage);
    },

    'AMAZON.StopIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'AMAZON.CancelIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'AMAZON.NoIntent': function () {
        this.emit(':tell', shutdownMessage);
    },

    'AMAZON.YesIntent': function () {
        output = welcomeMessage;
        alexa.emit(':ask', classNumberMoreInfoText, classNumberMoreInfoText);
    },

    'SessionEndedRequest': function () {
        this.emit('AMAZON.StopIntent');
    },

    'Unhandled': function () {
        this.emit(':ask', helpMessage, helpMessage);
    }
});

// register handlers
exports.handler = function (event, context, callback) {
    alexa = Alexa.handler(event, context);
    alexa.appId = APP_ID;
    alexa.registerHandlers(newSessionHandlers, startSearchHandlers, descriptionHandlers);
    alexa.execute();
};
//======== HELPER FUNCTIONS ==============

// Remove HTML tags from string
function removeTags(str) {
    if (str) {
        return str.replace(/<(?:.|\n)*?>/gm, '');
    }
}

// Given an AMAZON.DATE slot value parse out to usable JavaScript Date object
// Utterances that map to the weekend for a specific week (such as �this weekend�) convert to a date indicating the week number and weekend: 2015-W49-WE.
// Utterances that map to a month, but not a specific day (such as �next month�, or �December�) convert to a date with just the year and month: 2015-12.
// Utterances that map to a year (such as �next year�) convert to a date containing just the year: 2016.
// Utterances that map to a decade convert to a date indicating the decade: 201X.
// Utterances that map to a season (such as �next winter�) convert to a date with the year and a season indicator: winter: WI, spring: SP, summer: SU, fall: FA)
function getDateFromSlot(rawDate) {
    // try to parse data
    var date = new Date(Date.parse(rawDate));
    var result;
    // create an empty object to use later
    var classDate = {

    };

    // if could not parse data must be one of the other formats
    if (isNaN(date)) {
        // to find out what type of date this is, we can split it and count how many parts we have see comments above.
        var res = rawDate.split("-");
        // if we have 2 bits that include a 'W' week number
        if (res.length === 2 && res[1].indexOf('W') > -1) {
            var dates = getWeekData(res);
            classDate["startDate"] = new Date(dates.startDate);
            classDate["endDate"] = new Date(dates.endDate);
            // if we have 3 bits, we could either have a valid date (which would have parsed already) or a weekend
        } else if (res.length === 3) {
            var dates = getWeekendData(res);
            classDate["startDate"] = new Date(dates.startDate);
            classDate["endDate"] = new Date(dates.endDate);
            // anything else would be out of range for this skill
        } else {
            classDate["error"] = dateOutOfRange;
        }
        // original slot value was parsed correctly
    } else {
        classDate["startDate"] = new Date(date).setUTCHours(0, 0, 0, 0);
        classDate["endDate"] = new Date(date).setUTCHours(24, 0, 0, 0);
    }
    return classDate;
}

// Given a week number return the dates for both weekend days
function getWeekendData(res) {
    if (res.length === 3) {
        var saturdayIndex = 5;
        var sundayIndex = 6;
        var weekNumber = res[1].substring(1);

        var weekStart = w2date(res[0], weekNumber, saturdayIndex);
        var weekEnd = w2date(res[0], weekNumber, sundayIndex);

        return Dates = {
            startDate: weekStart,
            endDate: weekEnd,
        };
    }
}

// Given a week number return the dates for both the start date and the end date
function getWeekData(res) {
    if (res.length === 2) {

        var mondayIndex = 0;
        var sundayIndex = 6;

        var weekNumber = res[1].substring(1);

        var weekStart = w2date(res[0], weekNumber, mondayIndex);
        var weekEnd = w2date(res[0], weekNumber, sundayIndex);

        return Dates = {
            startDate: weekStart,
            endDate: weekEnd,
        };
    }
}

// Used to work out the dates given week numbers
var w2date = function (year, wn, dayNb) {
    var day = 86400000;

    var j10 = new Date(year, 0, 10, 12, 0, 0),
        j4 = new Date(year, 0, 4, 12, 0, 0),
        mon1 = j4.getTime() - j10.getDay() * day;
    return new Date(mon1 + ((wn - 1) * 7 + dayNb) * day);
};

// Loops though the classes from the iCal data, and checks which ones are between our start data and out end date
function getClassesBeweenDates(startDate, endDate, classList) {

    var start = new Date(startDate);
    var end = new Date(endDate);
    var nowDate = new Date();

    var data = new Array();

    var isToday = isTodayCheck(start, nowDate);

    for (var i = 0; i < classList.length; i++) {
      var classDateParts =classList[i].eventDate.split('/');
      //please put attention to the month (parts[0]), Javascript counts months from 0:
      // January - 0, February - 1, etc
      var classEventDate = new Date(classDateParts[2],classDateParts[0]-1,classDateParts[1]);

        if (start.getTime() <= classEventDate.getTime() && end.getTime() >= classEventDate.getTime()) {
          if(isToday){
            var classStartsLater = isAfter(classList[i].eventStartTime, nowDate);
            if( classStartsLater ){
              data.push(classList[i]);
            }
          } else {
            data.push(classList[i]);
          }
        }
    }

    console.log("FOUND " + data.length + " classes between those times");
    return data;
}

function isTodayCheck(dateWithZeroSetHours, todaysDate){
  // call setHours to take the time out of the comparison
  if(dateWithZeroSetHours == todaysDate.setHours(0,0,0,0)) {
      // Date equals today's date
      return true;
  }
  return false;
}

function parseTimeString(timeString){
  var timeInt = 0;
  if(timeString.endsWith("pm")){
    timeInt += 12;
  }
  var dateInt = parseInt(timeString.substr(0,2));
  if(dateInt !== 12){ // 12 am will then be 0, 12 pm will be 12 from above.
    timeInt += dateInt;
  }

  return timeInt;
}

function isAfter(dateText, comparisonDateObject){
  var dateHours = parseTimeString(dateText);
  if(dateHours >= comparisonDateObject.getHours()){
    return true;
  }
  return false;
}

function getWeekDates(){
  var curr = new Date; // get current date
  var first = curr.getDate(); // First day is the day of the month - the day of the week
  var last = first + 6; // last day is the first day + 6

  var firstday = new Date(curr.setDate(first));
  var lastday = new Date(curr.setDate(last));

  var firstdayURLString = urlStringifyDate(firstday);
  var lastdayURLString = urlStringifyDate(lastday);

  return [firstdayURLString, lastdayURLString];
}

function urlStringifyDate(dateObj){
  var month = '';
  if((dateObj.getMonth()+1) < 10){
    month = '0'+ (dateObj.getMonth()+1);
  } else {
    month = (dateObj.getMonth()+1)
  }

  var dayOfMonth = '';
  if (dateObj.getDate() < 10){
    dayOfMonth = '0' + dateObj.getDate();
  } else {
    dayOfMonth = dateObj.getDate();
  }
  return month+'%2F'+dayOfMonth+'%2F'+dateObj.getFullYear();

}

function buildRelevantClassResponse(relevantClasses, slotValue){
  // Create output for both Alexa and the content card
  var cardContent = "";
  output = oneEventMessage;
  if (relevantClasses.length > 1) {
      output = utils.format(multipleEventMessage, relevantClasses.length);
  }

  output += utils.format(scheduledEventMessage, slotValue);

  var numberToReadOut = relevantClasses.length > maxNumberToReadOut ? maxNumberToReadOut : relevantClasses.length;
  nextIntentIndex = numberToReadOut;

  if (relevantClasses.length > 1) {
      output += utils.format(firstFiveMessage, numberToReadOut);
  }

  for(var m = 0; m < numberToReadOut; m++){
    if (relevantClasses[m] != null) {
        output += utils.format(classSummary, relevantClasses[m].eventName, relevantClasses[m].eventStartTime, relevantClasses[m].instructor);
    }
  }

  for (var i = 0;  i < relevantClasses.length; i++) {
      var date = new Date(relevantClasses[i].start);
      cardContent += utils.format(cardContentSummary, relevantClasses[i].eventName, relevantClasses[i].eventStartTime, relevantClasses[i].instructor);
  }

  output += classNumberMoreInfoText;
  return {cardContent: cardContent, output: output};
}

function filterTime(timeToStart, classesToFilter){
  // Filter by hour
  var requestHour = parseInt(timeToStart.substr(0,2));
  var requestMinute = parseInt(timeToStart.substr(3,2));
  classesToFilter = classesToFilter.filter(function(cls){
    return parseTimeString(cls.eventStartTime) >= requestHour;
  });

  // Filter by minute
  classesToFilter = classesToFilter.filter(function(cls){
    return parseInt(cls.eventStartTime.substr(3,2)) >= requestMinute;
  });

  return classesToFilter;
}
