/* ***** BEGIN LICENSE BLOCK *****
Copyright (c) 2007-2012, Chao ZHOU (chao@zhou.fr). All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the author nor the names of its contributors may
      be used to endorse or promote products derived from this software
      without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * ***** END LICENSE BLOCK ***** */

"use strict";

restclient.sqlite = {
  db: null,
  tables: {
    requests: " uuid TEXT NOT NULL PRIMARY KEY, \
                requestName TEXT NOT NULL, \
                favorite INTEGER NOT NULL, \
                requestUrl TEXT NOT NULL, \
                requestMethod TEXT NOT NULL, \
                request TEXT NOT NULL, \
                creationTime INTEGER NOT NULL, \
                lastAccess INTEGER NOT NULL",
    labels: " labelName TEXT NOT NULL, \
              uuid TEXT NOT NULL",
    history: "requestId TEXT PRIMARY KEY, \
              request TEXT NOT NULL, \
              lastAccess INTEGER NOT NULL"
  },
  sql: {
    getHistoryById: 'SELECT request FROM history WHERE requestId = :requestId',
    updateHistory: 'UPDATE history SET lastAccess = :lastAccess WHERE requestId = :requestId',
    newHistory: 'INSERT INTO history (requestId, request, lastAccess) VALUES (:requestId, :request, :lastAccess)',
    removeHistory: 'DELETE FROM history WHERE lastAccess < :lastAccess',
    
    getLabels: 'SELECT count(labelName) as sum,labelName FROM labels GROUP BY labelName ORDER BY labelName',
    newLabels: 'INSERT INTO labels (labelName, uuid) VALUES (:labelName, :uuid)',
    removeLabelByUUID: 'DELETE FROM labels WHERE uuid = :uuid',
    removeLabel: 'DELETE FROM labels WHERE labelName = :labelName',
    
    getRequestsByName: 'SELECT * FROM requests WHERE requestName = :requestName',
    getRequestsByLabels: 'SELECT * FROM requests WHERE uuid IN (SELECT uuid FROM labels WHERE labelName IN (placeholder) group by uuid having count(uuid) = :num) ORDER BY creationTime DESC, lastAccess DESC',
    getRequestByUUID: 'SELECT * FROM requests WHERE uuid = :uuid',
    newRequests: 'INSERT INTO requests (uuid, requestName, favorite, requestUrl, requestMethod, request, creationTime, lastAccess) VALUES (:uuid, :requestName, :favorite, :requestUrl, :requestMethod, :request, :creationTime, :lastAccess)',
    findRequestsByKeyword: 'SELECT * FROM requests WHERE requestName LIKE :word OR requestUrl LIKE :word ORDER BY creationTime DESC, lastAccess DESC',
    findRequestsByKeywordAndLabels: 'SELECT * FROM requests WHERE (requestName LIKE :word OR requestUrl LIKE :word) AND uuid IN (SELECT uuid FROM labels WHERE labelName IN (placeholder) group by uuid having count(uuid) = :num) ORDER BY creationTime DESC, lastAccess DESC',
    removeRequests: 'DELETE FROM requests WHERE uuid = :uuid',
    removeRequestByLabel: 'DELETE FROM requests WHERE uuid IN (SELECT uuid FROM labels WHERE labelName=:labelName)',
    updateRequestName: 'UPDATE requests SET requestName = :requestName WHERE uuid = :uuid',
    updateRequestFavorite: 'UPDATE requests SET favorite = :favorite WHERE uuid = :uuid'
  },
  open: function() {
    try{
      var file = restclient.FileUtils.getFile("ProfD", ["restclient.sqlite"]);
      //restclient.log(file.path);
      restclient.sqlite.db = restclient.Services.storage.openDatabase(file);
      return true;
    }
    catch(e) {
      restclient.error(e);
    }
    return false;
  },
  close: function() {
    try{
      restclient.sqlite.db.asyncClose();
    }
    catch(e) {
      restclient.error(e);
    }
  },
  initTables: function() {
    try{
      restclient.sqlite.db.createTable('requests', restclient.sqlite.tables['requests']);
      restclient.sqlite.db.createTable('labels', restclient.sqlite.tables['labels']);
      restclient.sqlite.db.createTable('history', restclient.sqlite.tables['history']);
    }
    catch(e) {
      restclient.error(e);
      return false;
    }
    return true;
  },
  destroyTables: function() {
    try{
      restclient.sqlite.db.executeSimpleSQL("DROP TABLE requests");
      restclient.sqlite.db.executeSimpleSQL("DROP TABLE labels");
      restclient.sqlite.db.executeSimpleSQL("DROP TABLE history");
    }
    catch(e) {
      restclient.error(e);
      return false;
    }
    return true;
  },
  getStatement: function(sqlName) {
    var sql = restclient.sqlite.sql[sqlName];
    return restclient.sqlite.db.createStatement(sql);
  },
  getHistoryById: function(requestId){
    if(typeof requestId !== 'string' || requestId === '')
      return false;
    var stmt = restclient.sqlite.getStatement('getHistoryById');
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
    
      binding.bindByName("requestId", requestId);
      params.addParams(binding);
      stmt.bindParameters(params);
      
      while (stmt.executeStep()) {
        var request = stmt.row.request;
        return JSON.parse(request);
      }
    }catch(aError){
      restclient.error(aError);
    }finally{
      stmt.reset();
    }
    return false;
  },
  saveHistory: function(request) {
    var requestStr = JSON.stringify(request);
    var requestId = "r-" + restclient.helper.sha1(requestStr);
    var lastAccess = new Date().valueOf();
    var exists = restclient.sqlite.getHistoryById(requestId);
    
    var sqlName = (exists === false) ? "newHistory" : "updateHistory";
    var stmt = restclient.sqlite.getStatement(sqlName);
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("requestId", requestId);
      if (exists === false)
        binding.bindByName("request", requestStr);
      binding.bindByName("lastAccess", lastAccess);
      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.execute();
    }catch(aError){
      restclient.error(aError);
      return false;
    }finally{
      stmt.reset();
    }
    return requestId;
  },
  removeHistory: function(days) {
    if(typeof days !== 'number')
      days = 30;
    var lastAccess = new Date();
    lastAccess.setDate(date.getDate() - days);
    lastAccess = lastAccess.valueOf();
    var stmt = restclient.sqlite.getStatement('removeHistory');
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("lastAccess", lastAccess);

      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.execute();
    }catch(aError){
      restclient.error(aError);
      return false;
    }finally{
      stmt.reset();
    }
    return true;
  },
  getRequestByName: function(requestName) {
    if(typeof requestName !== 'string' || requestName === '')
      return false;
    var stmt = restclient.sqlite.getStatement('getRequestsByName');
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
    
      binding.bindByName("requestName", requestName);
      params.addParams(binding);
      stmt.bindParameters(params);
      
      while (stmt.executeStep()) {
        var request = {};
        request.uuid = stmt.row.uuid;
        request.requestName = stmt.row.requestName;
        request.favorite = stmt.row.favorite;
        request.requestUrl = stmt.row.requestUrl;
        request.requestMethod = stmt.row.requestMethod;
        request.request = stmt.row.request;
        request.creationTime = stmt.row.creationTime;
        request.lastAccess = stmt.row.lastAccess;
        return request;
      }
    }catch(aError){
      restclient.error(aError);
    }finally{
      stmt.reset();
    }
    return false;
  },
  saveRequest: function(request, requestName, favorite, labels) {
    var uuid = restclient.generateUUID();
    var creationTime = new Date().valueOf();
    requestName = requestName || '';
    favorite = favorite || 0;
    labels = labels || [];
    labels = _.uniq(labels);
    try{
      var stmt = restclient.sqlite.getStatement('newRequests');
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
    
      binding.bindByName("uuid", uuid);
      binding.bindByName("requestName", requestName);
      binding.bindByName("favorite", favorite);
      binding.bindByName("requestUrl", request.url);
      binding.bindByName("requestMethod", request.method);
      binding.bindByName("request", JSON.stringify(request));
      binding.bindByName("creationTime", creationTime);
      binding.bindByName("lastAccess", creationTime);
    
      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.execute();
      
      var stmt = restclient.sqlite.getStatement('newLabels');
      for (var i = 0; i < labels.length; i++) {
        var params = stmt.newBindingParamsArray();
        var binding = params.newBindingParams();
        binding.bindByName("labelName", labels[i]);
        binding.bindByName("uuid", uuid);
        params.addParams(binding);
        stmt.bindParameters(params);
        stmt.execute();
      }
    }catch(aError){
      restclient.error(aError);
      return false;
    }finally{
      stmt.reset();
    }
    request.uuid = uuid;
    request.favorite = favorite;
    return request;
  },
  updateRequestName: function(uuid, requestName) {
    if(typeof requestName !== 'string' || requestName === '')
      return false;
    
    var stmt = restclient.sqlite.getStatement('updateRequestName');
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("uuid", uuid);
      binding.bindByName("requestName", requestName);
      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.execute();
    }catch(aError){
      restclient.error(aError);
      return false;
    }finally{
      stmt.reset();
    }
    return true;
  },
  updateRequestFavorite: function(uuid, favorite){
    var stmt = restclient.sqlite.getStatement('updateRequestFavorite');
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("uuid", uuid);
      binding.bindByName("favorite", favorite);
      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.execute();
    }catch(aError){
      restclient.error(aError);
      return false;
    }finally{
      stmt.reset();
    }
    return true;
  },
  getRequestsByLabels: function(labels){
    if(typeof labels === 'string' && labels !== '')
      labels = [labels];
    if(typeof labels !== 'object' || labels.length == 0)
      return false;
    var inClause = '';
    for(var i=0; i < labels.length; i++) {
      inClause += " :labelName" + i + ",";
    }
    inClause = inClause.substring(0, inClause.length - 1);
    var sql = restclient.sqlite.sql.getRequestsByLabels;
    sql = sql.replace(/placeholder/, inClause);
    
    var stmt = restclient.sqlite.db.createStatement(sql);
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      for(var i=0; i < labels.length; i++) {
        binding.bindByName("labelName" + i, labels[i]);
      }
      binding.bindByName("num", labels.length);
      params.addParams(binding);
      stmt.bindParameters(params);
      var requests = [];
      while (stmt.executeStep()) {
        var request = {};
        request.uuid = stmt.row.uuid;
        request.requestName = stmt.row.requestName;
        request.favorite = stmt.row.favorite;
        request.requestUrl = stmt.row.requestUrl;
        request.requestMethod = stmt.row.requestMethod;
        request.request = stmt.row.request;
        request.creationTime = stmt.row.creationTime;
        request.lastAccess = stmt.row.lastAccess;
        
        requests.push(request);
      }
      return requests;
    }catch(aError){
      restclient.error(aError);
    }finally{
      stmt.reset();
    }
    return false;
  },
  getRequestByUUID: function(uuid){
    if(typeof uuid !== 'string' || uuid === '')
      return false;
    var stmt = restclient.sqlite.getStatement('getRequestByUUID');
    //console.log(stmt);
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
    
      binding.bindByName("uuid", uuid);
      params.addParams(binding);
      stmt.bindParameters(params);
      
      while (stmt.executeStep()) {
        var request = {};
        request.uuid = stmt.row.uuid;
        request.requestName = stmt.row.requestName;
        request.favorite = stmt.row.favorite;
        request.requestUrl = stmt.row.requestUrl;
        request.requestMethod = stmt.row.requestMethod;
        request.request = stmt.row.request;
        request.creationTime = stmt.row.creationTime;
        request.lastAccess = stmt.row.lastAccess;
        return request;
      }
    }catch(aError){
      restclient.error(aError);
    }finally{
      stmt.reset();
    }
    return false;
  },
  findRequestsByKeyword: function(word, labels){
    if(typeof word !== 'string')
      return false;
    if(typeof labels === 'string' && labels != '')
      labels = [labels];
    
    var sql = restclient.sqlite.sql.findRequestsByKeyword;
    if(typeof labels === 'object' && labels.length > 0)
    {
      sql = restclient.sqlite.sql.findRequestsByKeywordAndLabels;
      var inClause = '';
      for(var i=0; i < labels.length; i++) {
        inClause += ":labelName" + i + ",";
      }
      inClause = inClause.substring(0, inClause.length - 1);
      sql = sql.replace(/placeholder/, inClause);
    }
    
    var stmt = restclient.sqlite.db.createStatement(sql);
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("word", '%' + word + '%');
      if(typeof labels === 'object' && labels.length > 0){
        for(var i=0; i < labels.length; i++) {
          binding.bindByName("labelName" + i, labels[i]);
        }
        binding.bindByName("num", labels.length);
      }
        
      params.addParams(binding);
      stmt.bindParameters(params);
      
      var requests = [];
      while (stmt.executeStep()) {
        var request = {};
        request.uuid = stmt.row.uuid;
        request.requestName = stmt.row.requestName;
        request.favorite = stmt.row.favorite;
        request.requestUrl = stmt.row.requestUrl;
        request.requestMethod = stmt.row.requestMethod;
        request.request = stmt.row.request;
        request.creationTime = stmt.row.creationTime;
        request.lastAccess = stmt.row.lastAccess;
        
        requests.push(request);
      }
      return requests;
    }catch(aError){
      restclient.error(aError);
    }finally{
      stmt.reset();
    }
    return false;
  },
  
  getLabels: function(){
    var stmt = restclient.sqlite.getStatement('getLabels');
    var labels = {};
    try{
      while (stmt.executeStep()) {
        labels[stmt.row.labelName] = stmt.row.sum;
      }
    }catch(aError){
      return false;
    }
    finally {
      stmt.reset();
    }
    return labels;
  },
  
  removeLabel: function(labelName, cascade){
    if(typeof labelName !== 'string' || labelName === '')
      return false;
    if(typeof cascade === 'undefined')
      cascade = false;
    
    if(cascade) {
      var stmt = restclient.sqlite.getStatement('removeRequestByLabel');
      try{
        var params = stmt.newBindingParamsArray(),
            binding = params.newBindingParams();
      
        binding.bindByName("labelName", labelName);
        params.addParams(binding);
        stmt.bindParameters(params);
        stmt.execute();
      }catch(aError){
        restclient.error(aError);
        return false;
      }finally{
        stmt.reset();
      }
    }
    
    var stmt = restclient.sqlite.getStatement('removeLabel');
    try{
      var params = stmt.newBindingParamsArray(),
          binding = params.newBindingParams();
      
      binding.bindByName("labelName", labelName);
      params.addParams(binding);
      stmt.bindParameters(params);
      stmt.execute();
    }catch(aError){
      restclient.error(aError);
      return false;
    }finally{
      stmt.reset();
    }
    return true;
  },
  
  importRequestFromJSON: function(setting) {
    // version <= 2.0.3
    if( typeof setting.labels === 'undefined' ) {
      for(var name in setting) {
        var request = setting[name],
            id = restclient.helper.sha1( JSON.stringify(request) );
        restclient.sqlite.saveRequest(request, name, 1);
      }
    }
    
  },
  migrateFavoriteRequest: function() {
    var requests = restclient.getPref('savedRequest', '');
    dump('savedRequest:' + requests);
    if( requests === '')
      return false;

    restclient.sqlite.open();
    restclient.sqlite.initTables();
    restclient.sqlite.importRequestFromJSON(JSON.parse(requests));
    restclient.sqlite.close();
  }
}