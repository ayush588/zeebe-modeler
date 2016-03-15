'use strict';

var Dialog = require('test/helper/mock/dialog'),
    Events = require('test/helper/mock/events'),
    FileSystem = require('test/helper/mock/file-system'),
    Workspace = require('test/helper/mock/workspace'),
    Logger = require('base/logger');

var App = require('app');

var select = require('test/helper/vdom').select,
    render = require('test/helper/vdom').render,
    simulateEvent = require('test/helper/vdom').simulateEvent;

var assign = require('lodash/object/assign'),
    find = require('lodash/collection/find');

var arg = require('test/helper/util/arg'),
    spy = require('test/helper/util/spy');

var bpmnXML = require('app/tabs/bpmn/initial.bpmn'),
    activitiXML = require('test/fixtures/activiti.xml'),
    dmnXML = require('app/tabs/dmn/initial.dmn');

var inherits = require('inherits');
var MultiEditorTab = require('app/tabs/multi-editor-tab');
var BaseEditor = require('app/editor/base-editor');

var Tab = require('base/components/tab');


function createBpmnFile(xml, overrides) {
  return assign({
    name: 'diagram_1.bpmn',
    path: 'diagram_1.bpmn',
    contents: xml,
    fileType: 'bpmn'
  }, overrides);
}

function createDmnFile(xml, overrides) {
  return assign({
    name: 'diagram_1.dmn',
    path: 'diagram_1.dmn',
    contents: xml,
    fileType: 'dmn'
  }, overrides);
}

var UNSAVED_FILE = { path: '[unsaved]' };


describe('App', function() {

  var events, logger, fileSystem, workspace, dialog, app;

  beforeEach(function() {
    dialog = new Dialog();
    events = new Events();
    fileSystem = new FileSystem();
    workspace = new Workspace();
    logger = new Logger();

    // given
    app = new App({
      dialog: dialog,
      events: events,
      fileSystem: fileSystem,
      workspace: workspace,
      logger: logger
    });

  });


  describe('run', function() {

    it('should emit "ready" event', function (done) {
      // then
      app.on('ready', done);

      // when
      app.run();
    });

  });


  describe('quit', function() {
    var file, SomeTab;

    beforeEach(function() {
      file = createBpmnFile(bpmnXML);

      SomeTab = function SomeTab(dirty) {
        this.dirty = dirty;

        this.on('focus', () => {
          this.events.emit('tools:state-changed', this, {
            dirty: this.dirty
          });
        });

        Tab.call(this, {
          events: events
        });
      };

      inherits(SomeTab, Tab);

      SomeTab.prototype.save = function(done) {
        done(null, file);
      };

      SomeTab.prototype.setFile = function() {};

      app.tabs = [];

    });

    it('should emit "quitting" event and close all dirty tabs on successful exit', function(done) {
      // given
      dialog.setResponse('close', file);

      app._addTab(new SomeTab(false));
      app._addTab(new SomeTab(true));
      app._addTab(new SomeTab(false));
      app._addTab(new SomeTab(true));


      app.on('quitting', function() {
        // then
        expect(app.tabs).to.have.length(2);

        done();
      });

      // when
      app.triggerAction('quit');
    });


    it('should emit "quit-aborted" event when closing tab results in error', function(done) {
      // given
      dialog.setResponse('close', userCanceled());

      app._addTab(new SomeTab(false));
      app._addTab(new SomeTab(true));
      app._addTab(new SomeTab(true));

      app.on('quit-aborted', function() {
        // then
        expect(app.tabs).to.have.length(3);

        done();
      });

      // when
      app.triggerAction('quit');
    });


    it('should emit "quit-aborted" event when closing tab is being canceled', function(done) {
      // given
      dialog.setResponse('close', 'cancel');

      app._addTab(new SomeTab(true));
      app._addTab(new SomeTab(false));
      app._addTab(new SomeTab(true));

      app.on('quit-aborted', function() {
        // then
        expect(app.tabs).to.have.length(3);

        done();
      });

      // when
      app.triggerAction('quit');
    });

  });


  it('should render', function() {

    // when
    var tree = render(app);

    // then
    expect(select('.footer', tree)).to.exist;
    expect(select('.tabbed.main', tree)).to.exist;
    expect(select('.menu-bar', tree)).to.exist;
  });


  describe('bpmn support', function() {

    it('should create new BPMN tab', function() {

      // when
      app.createDiagram('bpmn');

      var tree = render(app);

      // then
      // expect BPMN tab with editor to be shown
      expect(select('.bpmn-editor', tree)).to.exist;
    });


    it('should open passed BPMN diagram file', function() {

      // given
      var openFile = createBpmnFile(bpmnXML);

      // when
      app.openTabs([ openFile ]);

      // then
      expect(app.activeTab.file).to.eql(openFile);

      // and rendered ...

      var tree = render(app);

      // then
      // expect BPMN tab with editor to be shown
      expect(select('.bpmn-editor', tree)).to.exist;
    });

  });


  describe('dmn support', function() {

    it('should create new DMN tab', function() {

      // when
      app.createDiagram('dmn');

      var tree = render(app);

      // then
      // expect DMN tab with editor to be shown
      expect(select('.dmn-editor', tree)).to.exist;
    });


    it('should open passed DMN diagram file', function() {

      // given
      var openFile = createDmnFile(dmnXML);

      // when
      app.openTabs([ openFile ]);

      // then
      expect(app.activeTab.file).to.eql(openFile);

      // and rendered ...

      var tree = render(app);

      // then
      // expect BPMN tab with editor to be shown
      expect(select('.dmn-editor', tree)).to.exist;
    });

  });


  describe('xml support', function () {

    it('should render xml-view', function() {

      // given
      var openFile = createBpmnFile(bpmnXML),
          activeTab;

      // when
      app.openTabs([ openFile ]);

      activeTab = app.activeTab;

      activeTab.activeEditor = activeTab.getEditor('xml');

      var tree = render(app);

      // then
      // expect BPMN tab with editor to be shown
      expect(select('.xml-editor', tree)).to.exist;
    });

  });


  describe('file drop', function() {

    it('should open suitable files', function() {

      // given
      var validFile = {
        name: 'diagram_1.bpmn',
        path: 'diagram_1.bpmn',
        contents: bpmnXML
      };

      var invalidFile = {
        name: 'text.txt',
        path: '[unsaved]',
        contents: 'FOO BAR'
      };

      var droppedFiles = [ validFile, invalidFile ];

      // when
      app.filesDropped(droppedFiles);

      // then
      // only one file got added
      expect(app.tabs.length).to.eql(2);

      // valid diagram got opened
      expect(app.activeTab.file).to.eql({
        name: 'diagram_1.bpmn',
        path: 'diagram_1.bpmn',
        contents: bpmnXML,
        fileType: 'bpmn'
      });

      expect(dialog.unrecognizedFileError).to.have.been.calledWith(invalidFile, arg.any);
    });

  });


  describe('diagram opening', function() {

    it('should open BPMN file', function() {

      // given
      var openFile = {
        name: 'diagram_1.bpmn',
        path: 'diagram_1.bpmn',
        contents: bpmnXML
      };

      var expectedFile = assign({ fileType: 'bpmn' }, openFile);

      dialog.setResponse('open', [ openFile ]);

      // when
      app.openDiagram();

      // then
      expect(app.activeTab.file).to.eql(expectedFile);
    });


    it('should open DMN file', function() {

      // given
      var openFile = {
        name: 'diagram_1.dmn',
        path: 'diagram_1.dmn',
        contents: dmnXML
      };

      var expectedFile = assign({ fileType: 'dmn' }, openFile);

      dialog.setResponse('open', [ openFile ]);

      // when
      app.openDiagram();

      // then
      expect(app.activeTab.file).to.eql(expectedFile);
    });


    it('should fail on Error', function() {

      // given
      var lastTab = app.activeTab,
          openError = new Error('foo');

      dialog.setResponse('open', openError);

      // when
      app.openDiagram();

      // then
      expect(dialog.openError).to.have.been.called;

      // still displaying last tab
      expect(app.activeTab).to.eql(lastTab);
    });


    it('should fail on unrecognized file format', function() {

      // given
      var lastTab = app.activeTab,
          openFile = {
            name: 'diagram_1.bpmn',
            path: 'diagram_1.bpmn',
            contents: require('./no-bpmn.bpmn')
          };

      dialog.setResponse('open', [openFile]);

      // when
      app.openDiagram();

      // then
      expect(dialog.unrecognizedFileError).to.have.been.called;

      // still displaying last tab
      expect(app.activeTab).to.eql(lastTab);
    });


    it('should open multiple files', function() {

      var bpmnTab, dmnTab;

      // given
      var bpmnFile = {
        name: 'diagram_1.bpmn',
        path: 'diagram_1.bpmn',
        contents: bpmnXML
      };

      var dmnFile = {
        name: 'diagram_1.dmn',
        path: 'diagram_1.dmn',
        contents: dmnXML
      };

      var expectedBpmnFile = assign({ fileType: 'bpmn' }, bpmnFile),
          expectedDmnFile = assign({ fileType: 'dmn' }, dmnFile);

      dialog.setResponse('open', [ bpmnFile, dmnFile ]);

      // when
      app.openDiagram();

      bpmnTab = app.tabs[0];

      dmnTab = app.tabs[1];

      // then
      expect(bpmnTab.file).to.eql(expectedBpmnFile);
      expect(dmnTab.file).to.eql(expectedDmnFile);
    });


    it('should not open new tab for the same file', function() {

      var bpmnTab, dmnTab;

      // given
      var bpmnFile = {
        name: 'diagram_1.bpmn',
        path: 'diagram_1.bpmn',
        contents: bpmnXML
      };

      var dmnFile = {
        name: 'diagram_1.dmn',
        path: 'diagram_1.dmn',
        contents: dmnXML
      };

      var expectedBpmnFile = assign({ fileType: 'bpmn' }, bpmnFile),
          expectedDmnFile = assign({ fileType: 'dmn' }, dmnFile);

      dialog.setResponse('open', [ bpmnFile, dmnFile ]);
      app.tabs = [];

      // when
      app.openDiagram();
      app.openDiagram();
      app.openDiagram();
      app.openDiagram();
      app.openDiagram();

      dmnTab = app.tabs[0];
      bpmnTab = app.tabs[1];

      // then
      expect(bpmnTab.file).to.eql(expectedBpmnFile);
      expect(dmnTab.file).to.eql(expectedDmnFile);
      expect(app.tabs).length.to.be(2);

    });


    it('should open bpmn file and NOT activiti file', function() {

      // given
      var bpmnFile = {
        name: 'diagram_1.bpmn',
        path: 'diagram_1.bpmn',
        contents: bpmnXML
      };

      var activitiFile = {
        name: 'activiti.xml',
        path: 'activiti.xml',
        contents: activitiXML
      };

      var expectedBpmnFile = assign({ fileType: 'bpmn' }, bpmnFile);

      dialog.setResponse('open', [ bpmnFile, activitiFile ]);

      dialog.setResponse('namespace', 'cancel');

      // when
      app.openDiagram();

      // then
      expect(dialog.convertNamespace).to.have.been.called;

      expect(app.activeTab.file).to.eql(expectedBpmnFile);

      expect(app.tabs).to.have.length(2);
    });


    it('should open activiti file with convertion', function() {
      // given
      var activitiFile = {
        name: 'activiti.xml',
        path: 'activiti.xml',
        contents: activitiXML
      };

      var expectedActivitiFile = assign({ fileType: 'bpmn' }, activitiFile);

      dialog.setResponse('open', [ activitiFile ]);

      dialog.setResponse('namespace', 'yes');

      // when
      app.openDiagram();

      // then
      expect(app.activeTab.file.name).to.eql('activiti.xml');

      expect(app.activeTab.file).to.not.eql(expectedActivitiFile);
    });


    it('should open activiti file without convertion', function() {
      // given
      var activitiFile = {
        name: 'activiti.xml',
        path: 'activiti.xml',
        contents: activitiXML
      };

      var expectedActivitiFile = assign({ fileType: 'bpmn' }, activitiFile);

      dialog.setResponse('open', [ activitiFile ]);

      dialog.setResponse('namespace', 'no');

      // when
      app.openDiagram();

      // then
      expect(app.activeTab.file).to.eql(expectedActivitiFile);
    });

  });


  describe('diagram saving', function() {

    it('should save BPMN file', function() {

      // given
      var file = createBpmnFile(bpmnXML),
          tab = app.openTab(file);

      patchSave(tab, file);

      // when
      app.triggerAction('save');

      // then
      expect(fileSystem.writeFile).to.have.been.calledWith(file, arg.any);
    });


    it('should save-as BPMN file', function() {

      // given
      var file = createBpmnFile(bpmnXML),
          tab = app.openTab(file);

      var expectedFile = assign({}, file, { path: '/foo/bar', name: 'bar' });

      dialog.setResponse('saveAs', expectedFile);

      patchSave(tab);

      // when
      app.triggerAction('save-as');

      // then
      expect(fileSystem.writeFile).to.have.been.calledWith(expectedFile, arg.any);

      // expect tab got updated
      expect(app.activeTab.label).to.eql(expectedFile.name);
      expect(app.activeTab.title).to.eql(expectedFile.path);
    });


    it('should fail on Error', function() {

      // given
      var file = createBpmnFile(bpmnXML);
      var tab = app.openTab(file);

      var saveError = new Error('something went wrong');

      patchSave(tab, saveError);

      // when
      app.triggerAction('save');

      // then
      expect(dialog.saveError).to.have.been.calledWith(saveError, arg.any);
    });


    describe('save all', function() {

      it('should reset dirty state', function() {

        // given
        var saveTab = spy(app, 'saveTab');

        var bpmnFile = createBpmnFile(bpmnXML, UNSAVED_FILE);
        var dmnFile = createDmnFile(dmnXML, UNSAVED_FILE);

        var tabs = app.openTabs([ bpmnFile, dmnFile ]);

        patchSave(tabs);

        dialog.setResponse('saveAs', { path: bpmnFile.name });

        // when
        app.triggerAction('save-all');

        // then
        expect(saveTab).to.have.been.calledTwice;

        tabs.forEach(function(tab) {
          expect(tab.dirty).to.be.false;
        });
      });


      it('should abort when canceled', function() {

        // given
        var saveTab = spy(app, 'saveTab');

        var bpmnFile = createBpmnFile(bpmnXML, UNSAVED_FILE);
        var dmnFile = createDmnFile(dmnXML, UNSAVED_FILE);

        var tabs = app.openTabs([ bpmnFile, dmnFile ]);

        var bpmnTab = tabs[0],
            dmnTab = tabs[1];

        patchSave(bpmnTab);

        // when
        app.triggerAction('save-all');

        // then
        expect(saveTab).to.have.been.calledOnce;

        expect(bpmnTab.dirty).to.be.true;
        expect(dmnTab.dirty).to.be.true;
      });


      it('should abort on export error', function() {

        // given
        var saveTab = spy(app, 'saveTab');

        var bpmnFile = createBpmnFile(bpmnXML, UNSAVED_FILE);
        var dmnFile = createDmnFile(dmnXML, UNSAVED_FILE);

        var tabs = app.openTabs([ bpmnFile, dmnFile ]);

        var bpmnTab = tabs[0],
            dmnTab = tabs[1];

        // fail exporting the first tab already
        patchSave(bpmnTab, new Error('failed to save diagram'));

        // when
        app.triggerAction('save-all');

        // then
        expect(saveTab).to.have.been.calledOnce;

        expect(bpmnTab.dirty).to.be.true;
        expect(dmnTab.dirty).to.be.true;
      });


      it('should save dirty diagrams only', function() {

        // given
        var saveTab = spy(app, 'saveTab');

        var bpmnFile = createBpmnFile(bpmnXML);
        var dmnFile = createDmnFile(dmnXML, UNSAVED_FILE);

        var tabs = app.openTabs([ bpmnFile, dmnFile ]);

        var dmnTab = tabs[1];

        patchSave(dmnTab, function(done) {
          done(null, dmnFile);
        });

        // when
        app.triggerAction('save-all');

        // then
        expect(saveTab).to.have.been.calledOnce;
        expect(saveTab).to.have.been.calledWith(dmnTab, arg.any);
      });


      // TODO(nikku): needs to be implemented properly
      it('should select tab before saving', function() {

        // given
        var tabs = app.openTabs([
          createBpmnFile(bpmnXML, UNSAVED_FILE),
          createBpmnFile(bpmnXML, UNSAVED_FILE),
          createBpmnFile(bpmnXML, UNSAVED_FILE)
        ]);

        var activeTab = app.activeTab;

        var savingTab = tabs[1];

        patchSave(tabs);

        patchSave(savingTab, function(done) {
          expect(app.activeTab).to.eql(savingTab);

          done(null, savingTab.file);
        });

        // when
        app.saveTab(savingTab);

        // then
        expect(app.activeTab).to.eql(activeTab);
      });

    });

  });


  describe('tab closing', function() {

    it('should close showing close dialog on dirty tab', function() {
      // given
      var bpmnFile = createBpmnFile(bpmnXML, UNSAVED_FILE),
          openTab = app.openTab(bpmnFile);

      // when
      app.closeTab(openTab);

      // then
      expect(dialog.close).to.have.been.called;
    });


    it('should close without close dialog with clean tab', function() {
      // given
      var file = createBpmnFile(bpmnXML),
          openTab = app.openTab(file);

      // when
      app.closeTab(openTab);

      // then
      expect(dialog.close).to.not.have.been.called;
    });


    it('should save dirty file', function(done) {

      // given
      var file = createBpmnFile(bpmnXML, UNSAVED_FILE),
          openTab = app.openTab(file);

      var expectedFile = assign({}, file, { path: '/foo/bar', name: 'bar' });

      app.saveTab = function(tab, cb) {
        tab.setFile(expectedFile);

        cb(null, expectedFile);
      };

      // when
      dialog.setResponse('close', 'save');

      app.closeTab(openTab, function(err) {

        // then
        expect(app.tabs).to.not.contain(openTab);

        expect(dialog.close).to.have.been.called;

        done();
      });
    });


    it('should discard tab without saving', function(done) {
      // given
      var file = createBpmnFile(bpmnXML, UNSAVED_FILE),
          openTab = app.openTab(file);

      var expectedFile = assign({}, file, { path: '/foo/bar', name: 'bar' });

      app.saveTab = function(tab, cb) {
        tab.setFile(expectedFile);

        cb(null, expectedFile);
      };

      var saveTab = spy(app, 'saveTab');

      // when
      dialog.setResponse('close', 'discard');

      app.closeTab(openTab, function(err) {

        // then
        expect(app.tabs).to.not.contain(openTab);

        expect(dialog.close).to.have.been.called;

        expect(saveTab).to.have.not.been.called;

        done();
      });
    });


    it('should cancel tab closing', function(done) {
      // given
      var file = createBpmnFile(bpmnXML, UNSAVED_FILE),
          openTab = app.openTab(file);

      // when
      dialog.setResponse('close', userCanceled());

      app.closeTab(openTab, function(err) {

        // then
        expect(err).to.eql(userCanceled());
        expect(app.tabs).to.contain(openTab);

        expect(dialog.close).to.have.been.called;

        done();
      });
    });


    // TODO(nikku): needs to be implemented properly
    it.skip('should select tab before closing', function() {

      // given
      var tabs = app.openTabs([
        createBpmnFile(bpmnXML, UNSAVED_FILE),
        createBpmnFile(bpmnXML, UNSAVED_FILE),
        createBpmnFile(bpmnXML, UNSAVED_FILE)
      ]);

      var activeTab = app.activeTab;

      var closingTab = tabs[1];

      app.dialog.close = function(file, done) {
        expect(app.activeTab).to.eql(closingTab);
        done(null, null);
      };

      // when
      app.closeTab(closingTab);

        // then
      expect(app.activeTab).to.eql(activeTab);
    });

  });


  describe('menu-bar', function() {

    var tree;

    beforeEach(function() {
      tree = render(app);
    });


    it('should bind create-bpmn-diagram', function() {

      // given
      var element = select('.menu-bar [ref=create-bpmn-diagram]', tree);

      var createDiagram = spy(app, 'createDiagram');

      // when
      simulateEvent(element, 'mouseup');

      // then
      expect(createDiagram).to.have.been.calledWith('bpmn');
    });


    it('should bind create-dmn-diagram', function() {

      // given
      var element = select('.menu-bar [ref=create-dmn-diagram]', tree);

      var createDiagram = spy(app, 'createDiagram');

      // when
      simulateEvent(element, 'mouseup');

      // then
      expect(createDiagram).to.have.been.calledWith('dmn');
    });


    it('should bind open', function() {

      // given
      var element = select('.menu-bar [ref=open]', tree);

      var openDiagram = spy(app, 'openDiagram');

      // when
      simulateEvent(element, 'click');

      // then
      expect(openDiagram).to.have.been.called;
    });


    it('should bind save');

    it('should bind save-as');

    it('should bind undo');

    it('should bind redo');

    it('should bind export-png');

  });


  describe('tabs', function() {

    var tree;

    beforeEach(function() {
      tree = render(app);
    });


    it('should bind + tab, creating new diagram', function() {

      // given
      var element = select('.tabbed [ref=empty-tab]', tree);

      var createDiagram = spy(app, 'createDiagram');

      // when
      simulateEvent(element, 'click');

      // then
      expect(createDiagram).to.have.been.calledWith('bpmn');
    });

  });


  describe('workspace', function() {

    describe('api', function() {

      describe('#persistWorkspace', function() {

        it('should persist empty', function(done) {

          // when
          app.persistWorkspace(function(err, config) {

            // then
            expect(err).not.to.exist;

            expect(config).to.have.keys([
              'tabs',
              'activeTab',
              'layout'
            ]);

            expect(config.tabs).to.have.length(0);
            expect(config.activeTab).to.eql(-1);

            done();
          });
        });


        it('should persist tabs', function(done) {

          // given
          var bpmnFile = createBpmnFile(bpmnXML),
              dmnFile = createDmnFile(dmnXML);

          app.openTabs([ bpmnFile, dmnFile ]);
          app.selectTab(app.tabs[0]);

          // when
          app.persistWorkspace(function(err, config) {

            expect(err).not.to.exist;

            expect(config).to.have.keys([
              'tabs',
              'activeTab',
              'layout'
            ]);

            expect(config.tabs).to.eql([ bpmnFile, dmnFile ]);

            expect(config.activeTab).to.eql(0);

            done();
          });
        });

      });


      describe('#restoreWorkspace', function() {

        it('should restore saved', function(done) {

          // given
          var bpmnFile = createBpmnFile(bpmnXML),
              dmnFile = createDmnFile(dmnXML);

          var layout = {
            propertiesPanel: {
              open: false,
              width: 250
            },
            log: {
              open: false,
              height: 150
            }
          };

          workspace.setSaved({
            tabs: [ bpmnFile, dmnFile ],
            activeTab: 1,
            layout: layout
          });

          // when
          app.restoreWorkspace(function(err) {

            // then
            expect(err).not.to.exist;

            // two tabs + empty tab are open
            expect(app.tabs).to.have.length(3);
            expect(app.activeTab).to.eql(app.tabs[1]);
            expect(app.layout).to.eql(layout);

            done();
          });
        });


        it('should restore default', function(done) {

          // given
          workspace.setSaved(null);

          // when
          app.restoreWorkspace(function(err) {

            // then
            expect(err).not.to.exist;

            // empty tab is open
            expect(app.tabs).to.have.length(1);

            // empty tab is selected, too
            expect(app.tabs[0]).to.eql(app.activeTab);

            // empty tab is selected, too
            expect(app.activeTab).to.exist;

            done();
          });
        });

      });

    });


    describe('persist behavior', function() {

      it('should save on new tab', function(done) {

        // given
        var bpmnFile = createBpmnFile(bpmnXML);

        // when
        app.openTabs([ bpmnFile ]);

        // then
        app.on('workspace:persisted', function(err, config) {

          expect(err).not.to.exists;

          expect(config.tabs).to.have.length(1);
          expect(config.activeTab).to.eql(0);

          done();
        });
      });


      it('should save on tab change', function(done) {

        // given
        var bpmnFile = createBpmnFile(bpmnXML),
            dmnFile = createDmnFile(dmnXML);

        // when
        app.openTabs([ bpmnFile, dmnFile ]);
        app.selectTab(app.tabs[1]);

        // then
        app.on('workspace:persisted', function(err, config) {

          expect(err).not.to.exists;

          expect(config.tabs).to.have.length(2);
          expect(config.activeTab).to.eql(1);

          done();
        });
      });


      it('should save on tab close', function(done) {

        // given
        var bpmnFile = createBpmnFile(bpmnXML),
            dmnFile = createDmnFile(dmnXML);

        // when
        app.openTabs([ bpmnFile, dmnFile ]);
        app.closeTab(app.tabs[1]);

        // then
        app.on('workspace:persisted', function(err, config) {

          expect(err).not.to.exists;

          expect(config.tabs).to.have.length(1);
          expect(config.activeTab).to.eql(0);

          done();
        });
      });


      it('should not save unsaved tabs', function(done) {

        // when
        app.createDiagram('bpmn');

        // then
        app.on('workspace:persisted', function(err, config) {
          expect(err).not.to.exist;

          expect(config.tabs).to.have.length(0);

          done();
        });

      });

    });


    describe('restore behavior', function() {

      it('should restore on run', function() {

        // given
        var restoreWorkspace = spy(app, 'restoreWorkspace');

        // when
        app.run();

        // then
        expect(restoreWorkspace).to.have.been.called;
      });

    });

  });


  describe('event emitter', function() {

    var tab;

    beforeEach(function() {

      function SomeEditor() {
        BaseEditor.call(this, {});
      }

      inherits(SomeEditor, BaseEditor);

      SomeEditor.prototype.update = function() {
        this.emit('state-updated', { editorStateProperty: 'smth' });
      };

      tab = new MultiEditorTab({
        editorDefinitions: [
          { id: 'someEditor', label: 'SomeEditor', component: SomeEditor }
        ],
        id: 'someId',
        events: events,
        dialog: dialog
      });
    });


    describe('focus', function() {

      it('should be emitted on the active tab once selected', function(done) {
        // when
        app._addTab(tab);

        // assume
        expect(app.activeTab).not.to.eql(tab);

        tab.on('focus', function() {
          // then
          expect(app.activeTab).to.eql(tab);

          done();
        });

        // when
        app.selectTab(tab);
      });

    });


    describe('tools:state-changed', function() {

      it('should emit on application start', function(done) {

        // given
        app.once('tools:state-changed', function(tab, state) {

          // then
          expect(state).to.eql({});

          done();
        });

        // when
        app.run();
      });


      it('should emit on editor "state-updated" event', function(done)  {

        // given
        app._addTab(tab);

        app.on('tools:state-changed', function(tab, state) {

          // then
          expect(state).to.have.property('save', true);
          expect(state).to.have.property('editorStateProperty', 'smth');

          done();
        });

        // when
        app.selectTab(tab);
      });

    });

  });


  describe('export', function () {

    describe('api', function () {

      function createTab(file) {
        app.openTabs([ file ]);

        return app.tabs[0];
      }

      it('should export image', function(done) {

        // given
        var tab = createTab(createBpmnFile(bpmnXML)),
            exportedFile = {
              name: 'diagram_1.png',
              path: 'diagram_1.png',
              contents: 'foo',
              fileType: 'png'
            };

        tab.activeEditor.exportAs = function(type, callback) {
          callback(null, { contents: 'foo' });
        };

        dialog.setResponse('saveAs', exportedFile);

        // when
        app.exportTab(tab, 'png', function(err, file) {

          // then
          expect(file.name).to.equal('diagram_1.png');
          expect(file.path).to.equal('diagram_1.png');
          expect(file.contents).to.equal('foo');
          expect(file.fileType).to.equal('png');

          expect(dialog.saveAs).to.have.been.calledWith(exportedFile);

          done();
        });
      });


      it('should not export on error', function(done) {

        // given
        var tab = createTab(createBpmnFile(bpmnXML)),
            exportError = new Error('export failed');

        tab.activeEditor.exportAs = function(type, callback) {
          callback(exportError);
        };

        // when
        app.exportTab(tab, 'svg', function(err, svg) {

          // then
          expect(err).to.equal(exportError);

          expect(dialog.saveAs).to.not.have.been.called;

          done();
        });
      });


      it('should not export with DMN', function(done) {

        // given
        var tab = createTab(createDmnFile(dmnXML));

        // when
        app.exportTab(tab, 'svg', function(err, svg) {

          // then
          expect(err.message).to.equal('<exportAs> not supported for the current tab');

          expect(dialog.saveAs).to.not.have.been.called;

          done();
        });
      });

    });


    describe('menu-bar', function () {

      it('should be enabled when exporting is allowed', function(done) {
        // given
        var bpmnFile = createBpmnFile(bpmnXML),
            exportButton = find(app.menuEntries, { id: 'export-as' }),
            activeEditor;

        // when
        app.openTabs([ bpmnFile ]);

        activeEditor = app.activeTab.activeEditor;

        app.once('tools:state-changed', function() {
          // then
          expect(exportButton.disabled).to.be.false;

          done();
        });

        activeEditor.mountEditor(document.createElement('div'));
      });


      it('should show export as "jpeg" and "svg"', function(done) {
        // given
        var bpmnFile = createBpmnFile(bpmnXML),
            exportButton = find(app.menuEntries, { id: 'export-as' }),
            bpmnTab;

        app.openTabs([ bpmnFile ]);

        bpmnTab = app.activeTab;

        app.once('tools:state-changed', function() {

          // then
          expect(exportButton.choices).to.have.length(2);

          expect(exportButton.choices[0].id).to.equal('jpeg');
          expect(exportButton.choices[1].id).to.equal('svg');

          done();
        });

        // when
        app.emit('tools:state-changed', bpmnTab, { exportAs: [ 'jpeg', 'svg' ] });
      });


      describe('should update export button state', function() {

        it('when there are no open tabs', function() {
          // given
          var exportButton = find(app.menuEntries, { id: 'export-as' });

          // then
          expect(exportButton.disabled).to.be.true;
        });


        it('when closing a tab where it was enabled', function() {
          // given
          var bpmnFile = createBpmnFile(bpmnXML),
              exportButton;

          app.openTabs([ bpmnFile ]);

          app.closeTab(app.activeTab);

          exportButton = find(app.menuEntries, { id: 'export-as' });

          // then
          expect(exportButton.disabled).to.be.true;
        });


        it('when switching tabs', function(done) {
          // given
          var bpmnFile = createBpmnFile(bpmnXML),
              dmnFile = createDmnFile(dmnXML),
              exportButton = find(app.menuEntries, { id: 'export-as' }),
              bpmnTab,
              activeEditor;

          app.openTabs([ bpmnFile, dmnFile ]);

          bpmnTab = app.tabs[0];

          activeEditor = bpmnTab.activeEditor;

          activeEditor.mountEditor(document.createElement('div'));

          app.once('tools:state-changed', function() {
            // then
            expect(exportButton.disabled).to.be.false;

            done();
          });

          // when -> selecting bpmn tab
          app.selectTab(bpmnTab);
        });


        it('when switching editor views', function(done) {
          // given
          var bpmnFile = createBpmnFile(bpmnXML),
              exportButton = find(app.menuEntries, { id: 'export-as' }),
              activeTab, xmlEditor;

          app.openTabs([ bpmnFile ]);

          activeTab = app.activeTab;

          xmlEditor = activeTab.getEditor('xml');

          xmlEditor.mountEditor(document.createElement('div'));

          app.once('tools:state-changed', function() {
            // then
            expect(exportButton.disabled).to.be.true;

            done();
          });

          // when -> on xml view
          activeTab.setEditor(xmlEditor);
        });

      });

    });

  });

});


/**
 * Patch save on a tab or a list of tabs.
 *
 * @param {Tab|Array<Tab>} tabs
 * @param {Error|FileDescriptor|Function} answer
 */
function patchSave(tabs, answer) {

  if (!('length' in tabs)) {
    tabs = [ tabs ];
  }

  tabs.forEach(function(tab) {

    var fn = typeof answer === 'function' ? answer : function(done) {
      if (answer instanceof Error) {
        return done(answer);
      }

      return done(null, answer || tab.file);
    };

    tab.save = fn;
  });
}


function userCanceled() {
  return new Error('user canceled');
}