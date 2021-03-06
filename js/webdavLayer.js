/*
    webdavLayer.js - Encapsulation of davclient.js used to interract with a webDAV server
    Copyright (C) 2016  Ludovic PLANTIN

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
var webdavLayer = (function($, davlib) {

    var client = new davlib.DavClient();
    var host, root, port, protocol, username, password;
    var debug = false;

    /**
        The constructor
    
        p.protocol - protocol part of URLs (optional, defaults to http)
        p.host - the host name or IP
	p.rootURI - the server side processor address
        p.port - HTTP port of the host (optional, defaults to 80)
        p.username - the username for authorization (only Basic auth is supported at that time)
        p.password - the password to use
        p.rootDir - the root dir
        p.success(dirContent{dirList, fileList}) : method called on success
        p.error(errorCode, errorMsg) : method called on error
    */
    function connect(p) {
        if (debug) console.log('initialize() - Protocol=' + p.protocol + ' Host=' + p.host 
                               + ' Port=' + p.port + ' username=' + p.username
                               + ' RootDir=' + p.rootDir);
        host = p.host;
        port = p.port;
        protocol = p.protocol;
        username = p.username;
        password = p.password;
	root = p.rootURI;
        client.initialize(host+p.rootURI, port, protocol, username, password);
        listDir({
            dir: p.rootDir,
            success: p.success,
            error: p.error
        });
    }

    /**
        Extract directory content (dir and file) from webdav server response.
        This methode is "hand made" from the response I get from my server without looking at webdav specification
        or testing it on several browser.
        It will certainly need some corrections to work with another webdav server or configuration
        (in particular the xml tag prefix shortcut "D" for "DAV" and the directory contentType "httpd/unix-directory").
    */
    function extractDirContent(webdavResponse, browsedDirectory) {
        if (debug) console.log('extractDirContent() - WebdavResponse : ' + webdavResponse);
        var dirContent = { dirList: [ ], fileList: [ ] };
        var xmlDoc = $.parseXML(webdavResponse);
        var filterOnlyDirectoryContent = new RegExp(browsedDirectory + "/?[^/]+");
        $(xmlDoc).find('response, D\\:response, DAV\\:response').each(function(){
            var fileContentType = $(this).find('getcontenttype, D\\:getcontenttype, DAV\\:getcontenttype').text(); 
            var isDir = (fileContentType == 'httpd/unix-directory')||
		($(this).find('collection, D\\:collection, DAV\\:collection').length!=0);
            var fileHref = $(this).find('href, D\\:href, DAV\\:href').text();
            var file = decodeURI(fileHref);
            if (file.match(filterOnlyDirectoryContent)) {
                var filename;
                if(file === '/remote.php/webdav/'){
                    filename = "/";
                } else {
                    filename = file.replace(/^.*\/([^\/]+)\/*$/, '$1');
                }
                if ( isDir ) {
                    dirContent.dirList.push(filename);
                } else {
                    dirContent.fileList.push(filename);
                }
            }
        });
        dirContent.dirList.sort();
        dirContent.fileList.sort();
        if (debug) console.log(dirContent);
        return dirContent;
    }

    function responseHandler(p, expectedStatus, contentWrapper, contentWrapperArg) {
        return function(status, statusstr, content) {
            if (status == expectedStatus) {
                if (p.success) {
                    if (contentWrapper) p.success(contentWrapper(content, contentWrapperArg));
                    else p.success(content);
                }
            } else {
                console.log('UnexpectedStatus :' + status + ' - ' + statusstr);
                if (p.error) p.error(status, statusstr);
            }
        }
    }

    function catchCallError(err, errorCallback) {
        console.log(err);
        if (errorCallback) {
            var msg = 'Unable to call remote server'
            if (err.message) {
                msg += ', ' + err.message;
            }
            errorCallback(err.name, msg);
        }
    }

    /**
     * p.dir : directory to list content
     * p.success(dirContent{dirList, fileList}) : method called on success
     * p.error(status, statusstr) : method called on error
     */
    function listDir(p) {
        if (debug) console.log('listDir() : dir=' + p.dir);
        try {
            client.PROPFIND(p.dir, responseHandler(p, 207, extractDirContent, p.dir), null, 1);
        } catch (err) {
            catchCallError(err, p.error);
        }
    }

    /**
     * p.dir
     * p.success(content)
     * p.error(status, statusstr)
     */
    function createDir(p) {
        if (debug) console.log('createDir() - Dir : ' + p.dir);
        try {
            client.MKCOL(p.dir, responseHandler(p, 201));
        } catch (err) {
            catchCallError(err, p.error);
        }
    }

    /**
     * p.src
     * p.dest
     * p.success(content)
     * p.error(status, statusstr)
     */
    function moveFile(p) {
        if (debug) console.log('moveFile() - File : ' + p.src + ' to ' + p.dest);
        try {
            client.MOVE(p.src, p.dest, responseHandler(p, 201));
        } catch (err) {
            catchCallError(err, p.error);
        }
    }

    /**
     * p.src
     * p.dest
     * p.success(content)
     * p.error(status, statusstr)
     */
    function copyFile(p) {
        if (debug) console.log('copyFile() - File : ' + p.src + ' to ' + p.dest);
        try {
            client.COPY(p.src, p.dest, responseHandler(p, 201));
        } catch (err) {
            catchCallError(err, p.error);
        }
    }

    /**
     * p.file
     * p.success(content)
     * p.error(status, statusstr)
     */
    function deleteFile(p) {
        if (debug) console.log('deleteFile() - File : ' + p.file);
        try {
            client.DELETE(p.file, responseHandler(p, 204));
        } catch (err) {
            catchCallError(err, p.error);
        }
    }

    /**
     * p.fileName
     * p.remoteDir
     * p.fileData
     * p.success(content)
     * p.error(status, statusstr)
     */
    function uploadFile(p) {
        if (debug) console.log('Upload of ' + p.fileName + ' in ' + p.remoteDir);
        try {
            var req = new XMLHttpRequest();
            req.open('PUT', protocol + '://' + host + ':' + port + p.rootURI + p.remoteDir + p.fileName, true);
            req.setRequestHeader('Authorization', 'Basic ' + btoa(username + ':' + password));
            req.onreadystatechange = function() {
                if (req.readyState == 4) {
                    if (debug) console.log('Upload of ' + p.fileName + ' status : ' + req.status);
                    if (req.status == 200 || req.status == 201) {
                        if (p.success) p.success(req.responseText);
                    } else {
                        if (p.error) p.error(req.status, davlib.STATUS_CODES[req.status]);
                    }
                }
            };
            req.send(p.fileData);
        } catch (err) {
            catchCallError(err, p.error);
        }
    }

    /**
     * file
     */
    function openFile(file) {
        if (debug) console.log('openFile() - File : ' + file);
        try {
            window.open(protocol + '://' + username + ':' + password + '@'+ host + ':' + port + root + file, '_blank');
        } catch (err) {
            console.log(err);
            window.open(protocol + '://' + host + ':' + port + root + file, '_blank');
        }
    }

    return {
        connect: connect,
        listDir: listDir,
        createDir: createDir,
        moveFile: moveFile,
        copyFile: copyFile,
        deleteFile: deleteFile,
        uploadFile: uploadFile,
        openFile: openFile
    };

})(jQuery, davlib);

