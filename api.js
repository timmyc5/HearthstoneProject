var express = require('express');
var router = express.Router();
var app= require('../app');
var db_api = require('../models/db_api');
var deckstrings = require('deckstrings');
var fs = require('fs');
var cardJSON = './json_data/card-data.json';

var Promise = require('es6-promise');

var id_to_dbfid = {};

decode = function(deckcode) {
    try {
        return deckstrings.decode(deckcode);
    } catch (e) {
        return null
    }
}

var parse_deck_info = function (data, done) {
    var deck_info = [];
    var deck_names = [];
    var decoded_deckstring = [];
    var deckcodes = [];
    for (var i = 0; i < data.length; i++) {
        // get decoded deckcode data
        deckcodes[i] = data[i].deckcode;

        decoded_deckstring = decode(deckcodes[i]);

        // if unable to decode or invalid deckstring
        if (decoded_deckstring == null) {
            decoded_deckstring = {};
        }

        deck_info.push(data[i].deckcode);
        deck_names.push(data[i].deckname);
    }
    done({success : true, decks: deck_info, deck_names : deck_names})
};

/* GET user decklists.
* Input: params: userid
* Return: array of decklists. Example: [["deckname1", deckcode1],["deckname2", deckcode2"]]*/
router.get('/get_user_decklists', function(req, res) {
    var userid = req.query.userid;
    db_api.get_user_decklists(userid, function(err, data){
        if (err) {
            console.log(err.message);
            res.send(JSON.stringify({success : false, mesage : err.message}));
        } else {
            // reformat deck info to an array
            parse_deck_info(data, function(json_data) {
                res.send(json_data)
            })
        }
    });
});

/* input: params: userid, deckcode, deckname (Josh test)
 * return: { 'success' : true/false, 'error' : none/error_code/error_message } */
router.get('/add_deck', function(req, res) {
  var userid = req.query.userid;
  var deckcode = req.query.deckcode;
  var deckname = req.query.deckname;
  console.log(userid + " " + deckcode);

  db_api.add_deck(userid, deckcode, deckname, function(err, insertId) {
      if (err) {
          console.log('Unable to add deck');
          res.send(JSON.stringify({ success: false, error: err.message }))
      } else {
          res.send(JSON.stringify({ success: true }));
      }
  });
});

/* input: params: userid, deckcode
* return: { 'success' : true/false, 'error' : none/error_code }*/
router.get('/delete_deck', function(req, res) {
    var userid= req.query.userid;
    var deckcode= req.query.deckcode;

    db_api.delete_deck(userid, deckcode, function(err, data){
        if(err){
            console.log(err.message);
            console.log('Delete deck failed');
            res.send(JSON.stringify({ success: false, error: err.message }))
        } else{
            console.log(req.query.userid);
            console.log(req.query.deckcode);
            console.log(data);
            res.send(JSON.stringify({ success: true }));
        }
    });
});

/*
    converts a card list to a json for easier comparisons
 */
var convert_card_list_to_json = function (cardlist, done) {
    var card_json = {};
    for (var i = 0; i < cardlist.length; i ++) {
        card_json[cardlist[i][0]] = cardlist[i][1];
        console.log(cardlist[i])
    }
    done(card_json);
};


/*
    compares two same deckjsons and sees if played_deckjson is a derivative of saved_deckjson
 */
var compare_played_deckjson_to_saved_deckstring = function(saved_deckjson, played_deckjson) {

    // iterate over every played card id
    for (var cardid in played_deckjson) {
        console.log(id_to_dbfid[cardid]);
        // played card should be in saveddeck have been played <= to num in saveddeck
        if (id_to_dbfid[cardid] in saved_deckjson && saved_deckjson[id_to_dbfid[cardid]] >= played_deckjson[cardid]) {
        } else {
            return false;
        }
    }
    return true;
};

/*
    checks if played deck is in user submitted deck
    will need to update to check if in tournament
    expected post method with json in body, formatted like:

     {
        "userid": 1,
        "tournamentid" : 1,
        "deckjson" : {
            "1": 1,
            "2" : 5
     }
 }
 */
router.post('/validate_decklist', function(request, res) {
    // post request, get info from body
    var played_deckjson = request.body;

    // get users saved decklists
    db_api.get_user_tournament_decklists(played_deckjson['userid'], played_deckjson['tournamentid'], function (err, deck_strings) {
        if (err) {
            res.send(err.message);
        }

        // assumes match is not fair until mismatch is found
        var fair_match = false;

        // don't want to return true if no decklist is found, so keep track of that
        var deck_match = false;

        // iterate over decklists returned from get_user_decklists
        var promises = deck_strings.map(function (item) {
            var saved_deckcode = decode(item.deckcode);

            // if deckcode converted properly played cards not in a saved deckstring
            if (saved_deckcode != null) {
                deck_match = true;

                // convert decklist to json
                convert_card_list_to_json(saved_deckcode['cards'], function(saved_deckjson) {

                    // compare for fairness
                    if (compare_played_deckjson_to_saved_deckstring(saved_deckjson, played_deckjson['deckjson'])) {
                        fair_match = true;
                    }
                });
            }
        });

        // wait for checking to complete
        Promise.all(promises).then(function() {
            fair_match = fair_match && deck_match;
            res.send(JSON.stringify({ success : true, fair_match : fair_match}))
        })
    });
});


/* GET users listing.
 * input: params: userid, deckname, deckcode
  * return: { 'success' : true/false, 'error' : none/error_code }*/
router.get('/update_decklist_name', function(req, res) {
    var userid = req.query.userid;
    var deckname = req.query.deckname;
    var deckcode = req.query.deckcode;

    db_api.update_decklist_name(userid, deckcode, deckname,function(err, response){
        if(err){
            console.log('Update deckname failed');
        } else{
            res.send(response);
        }
    });
});

/*
Stub for logging in a user
Takes in an battletag and returns userid
If battletag not in database, returns info about that
 */
router.get('/login', function(req, res) {
   var battletag = req.query.battletag;
   db_api.login(battletag, function(err, userid) {

       // user not created
       if(userid == null) {
            res.send(JSON.stringify({success : false, message : 'battletag not yet registered'}));
        } else {
            res.send(JSON.stringify({success : true, id : userid}));
        }
   })
});

/* create new user
 * input: param: battletag
  * return: { 'success' : true/false, 'error' : none/error_code }*/
router.get('/create_user', function(req, res) {
    var battletag = req.query.battletag;
    db_api.create_user(battletag, function(err, userid) {

        // likely user already registered
        if(err) {
            console.log(err.message);
            res.send(JSON.stringify({success : false, error: err.message}));

        }
        else {
            res.send(JSON.stringify({success : true, id : userid}));
        }
    });
});

/* input: params: userid, deckcode
 * return: { 'success' : true/false, 'error' : none/error_code }*/
router.get('/delete_tournament', function(req, res) {
    var tournamentid= req.query.tournamentid;

    db_api.delete_tournament(tournamentid, function(err, data){
        if(err){
            console.log(err.message);
            res.send(JSON.stringify({success : false, error: err.message}));
        } else {
            res.send(JSON.stringify({success: true}));
        }
    });
});


/*
returns
{
    numDecks : int,
    matches_played : boolean,
    decks : [ list of deck info ]
}
 */
router.get('/join_tournament', function(req, res) {
    var userid = req.query.userid;
    var tournamentid = req.query.tournamentid;

    db_api.get_user_tournament_decklists(userid, tournamentid, function(err, data) {
        if (err) {
            console.log(err.message);
            res.send(JSON.stringify({ success : false, err : err.message}));
        }

        db_api.join_tournament(userid, tournamentid, function(err, numDecks) {
            if (err) {
                console.log(err.message);
                res.send(JSON.stringify({ success : false, err : err.message }))
            } else {
                parse_deck_info(data, function(json_data) {
                    json_data['numDecks'] = numDecks;
                    json_data['matches_played'] = false;

                    // only need to check if matches played if decks are submitted
                    if (data.length > 0) {
                        db_api.get_user_tournament_matches_count(userid, tournamentid, function(err, count) {
                            if (err) {
                                console.log(err.message);
                                res.send(JSON.stringify({ success : false, err : err.message}));
                            } else {
                                if (count[0]['COUNT(*)'] > 0) {
                                    json_data['matches_played'] = true;
                                }
                                res.send(json_data);
                            }
                        })
                    } else {
                        res.send(json_data);
                    }

                });
            }
        })
    });
/*
    db_api.join_tournament(userid, tournamentid, function(err, numDecks) {
        if(err) {
            console.log(err.message);
            res.send(JSON.stringify({ success : false, err : err.message }))
        } else {
            res.send(JSON.stringify({success: true, numDecks: numDecks}));
        }
    })
    */
});

router.get('/get_tournament_battletags', function(req, res) {
    var tournamentid = req.query.tournamentid;
    db_api.get_tournament_battletags(tournamentid, function(err, battletags) {
        if (err) {
            res.send(JSON.stringify({success : false, error : err.message}));
        } else {

            var tags = [];
            for (var i = 0; i < battletags.length; i++) {
                tags.push(battletags[i].battletag);
            }
            res.send(JSON.stringify({success : true, battletags : tags}))
        }
    })
})

/*return: { 'success' : true/false, 'error' : none/error_code }*/
router.get('/create_tournament', function(req, res) {
    var name = req.query.name;
    var numDecks = req.query.numDecks;
    var userid = req.query.userid;

    db_api.create_tournament(name, numDecks, userid, function(err, tournamentid) {

        //likely tournament already created
        if(err) {
            console.log(err.message);
            res.send(JSON.stringify({success : false, error: err.message}));
        }
        else {
            res.send(JSON.stringify({success : true, id : tournamentid}));
        }
    });
});

router.get('/create_match', function(req, res)
{
    var homeTeamId = req.query.homeTeamId;
    var awayTeamId= req.query.awayTeamId;
    var winningTeamId= req.query.winningTeamId;
    var tournamentid= req.query.tournamentid;
    var isValid= req.query.isValid;
    var matchDate= req.query.matchDate;

    db_api.create_match(homeTeamId, awayTeamId, winningTeamId, tournamentid, isValid, matchDate, function(err, matchid)
    {
        if(err)
        {
            console.log(matchid);
            console.log(err.message);
            res.send(JSON.stringify({success : false, error: err.message}));
        }
        else
        {
            console.log(matchid);
            res.send(JSON.stringify({success : true, id : matchid}));
        }
    });

});

router.get('/delete_match', function (req, res)
{
   var matchid = req.query.matchid;

   db_api.delete_match(matchid, function(err, status)
   {
       if(err)
       {
           console.log(JSON.stringify(status));
           res.send(JSON.stringify({success: false, error: err.message}));
       }
       else
       {
           console.log(JSON.stringify(status));
           res.send(JSON.stringify({success: true}));
       }
   })

});

router.get('/get_match', function(req, res)
{
    var matchid = req.query.matchid;
    var userid= req.query.userid;

    db_api.get_match(matchid, userid, function(err, status)
    {
        if(err)
        {
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: false, error: err}));
        }
        else
        {
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: true, match: status}));
        }

    })
});

/* input: params: userid
return: tournament jsons owned by a userid

* {
"tournamentname": rows.name,
"matches": {
    "matchid": match.matchid,
    "player1": match.homeTeamId,
    "player2": match.awayTeamId,
    "winner": match.winningTeamId,
    "isValid": match.isValid}
                        });
 */
router.get('/get_tournaments', function(req, res){
    var userid = req.query.userid;
    db_api.get_tournaments(userid, function(err, status){
        if(err){
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: false, error: err.message}));
        }
        else{
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: true, data: status}));
        }
    })
});

/*
* input: userid, tournamentid, deckcode;
* returns: void
*/
router.get('/add_tournament_deck', function(req, res){
    var userid = req.query.userid;
    var tournamentid = req.query.tournamentid;
    var deckcode = req.query.deckcode.split(",");
    db_api.add_tournament_deck(userid, tournamentid, deckcode, function(err, status){
        if (err){
            console.log("error db_api adding tournament deck");
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: false, error: err.message}));
        }
        else{
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: true}));
        }
    })
});

router.get('/ban_tournament_deck', function(req, res){
    var userid = req.query.userid;
    var tournamentid = req.query.tournamentid;
    var deckcode = req.query.deckcode;
    db_api.ban_tournament_deck(userid, tournamentid, deckcode, function(err, status){
        if(err){
            console.log("error db_api banning deck");
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: false, error: err.message}));
        }
        else {
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: true}));
        }
    })
});

/* input: params: matchid, winnerid
 * return: { 'success' : true/false, 'error' : none/error_code }*/
router.get('/update_match_result', function(req, res) {
    var matchid = req.query.matchid;
    var winnerid = req.query.winnerid;
    var fair_match = req.query.fairmatch;

    db_api.update_match_result(matchid, winnerid, fair_match, function(err, status){
        if (err) {
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: false, error: err.message}));
        }
        else {
            console.log(JSON.stringify(status));
            res.send(JSON.stringify({success: true}));
        }

    })
});

fs.readFile(cardJSON, 'utf8', function (err, data) {
    if (err) throw err;

    //JSON parse command
    data = JSON.parse(data);
    for (i = 0; i < data.length; i++) {

        //pull info from JSON file
        id_to_dbfid[data[i].id] = data[i].dbfId;
    }
});

module.exports = router;
