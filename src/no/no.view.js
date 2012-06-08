//  ---------------------------------------------------------------------------------------------------------------  //
//  no.View
//  ---------------------------------------------------------------------------------------------------------------  //

(function() {

//  ---------------------------------------------------------------------------------------------------------------  //

no.View = function() {};

no.extend(View.prototype, no.Events);

//  ---------------------------------------------------------------------------------------------------------------  //

//  Typedefs.

/**
    @typedef {function(
        new:no.View,
        string,
        !Object
    )}
*/
no.View.type_ctor;

/**
    @typedef {{
        models: Object,
        params: Object,
        events: Object
    }}
*/
no.View.type_info;

//  ---------------------------------------------------------------------------------------------------------------  //

no.View.prototype.init = function(id, params) {
    this.id = id;
    this.params = params;

    this.info = no.View.info(id);

    this.status = 'none';

    this.state = '';

    //  Здесь хранятся все непосредственный view-потомки.
    //  Структура такая:
    //
    //      {
    //          'photo': {
    //              active: 'key_2',
    //              views: {
    //                  'key_1': view_1,
    //                  'key_2': view_2,
    //                  ...
    //              }
    //          },
    //          'comments': {
    //              ...
    //          },
    //          ...
    //      }
    //
    this._boxes = {};
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.View.prototype.getKey = function() {
    return no.View.getKey(this.id, this.params, this.info);
};

/**
    @param {string} id
    @param {Object} params
    @param {no.View.type_info=} info
    @return {string}
*/
no.View.getKey = function(id, params, info) {
    info = info || no.View.info(id);

    var key = 'view=' + id;

    var pNames = info.pNames || [];
    for (var i = 0, l = pNames.length; i < l; i++) {
        var pName = pNames[i];
        var pValue = params[pName];
        if (pValue != null) {
            key += '&' + pName + '=' + pValue;
        }
    }

    return key;
};

//  ---------------------------------------------------------------------------------------------------------------  //

/** @type { Object.<string, no.View.type_info> } */
var _infos = {};

/** @type { Object.<string, no.View.type_ctor> } */
var _ctors = {};


/**
    @param {string} id
    @param {no.View.type_info=} info
    @param {no.View.type_ctor=} ctor
*/
no.View.define = function(id, info, ctor) {
    info = info || {};
    ctor = ctor || no.View;

    var models = info.models = info.models || [];

    var params = {};
    for (var i = 0, l = models.length; i < l; i++) {
        no.extend( params, no.Model.info( models[i] ).params );
    }
    if (info.params) {
        no.extend(params, info.params);
    }
    info.pNames = no.object.keys(params);

    _infos[id] = info;
    _ctors[id] = ctor;
};

/**
    @param {string} id
    @return {no.View.type_info}
*/
no.View.info = function(id) {
    return _infos[id];
};

//  ---------------------------------------------------------------------------------------------------------------  //

/**
    @param {string} view_id
    @param {!Object} params
    @return {no.View}
*/
no.View.create = function(id, params) {
    var ctor = _ctors[id] || no.View;
    var view = new ctor();
    view.init(id, params);

    return view;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.View.prototype._subView = function(id, params) {
    var view = no.View.create(id, params);
    this._addView(view);
};

no.View.prototype._addView = function(view) {
    var id = view.id;
    var box = this._boxes[id];
    if (!box) {
        box = this._boxes[id] = {
            active: null,
            views: {}
        };
    }
    box.views[view.key] = view;
};

no.View.prototype._setActiveView = function(view) {
    var id = view.id;
    var key = view.key;

    var box = this._boxes[id];
    if ( box && (key in box.views) ) {
        box.active = key;
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //


/**
    Рекурсивно обходим все дерево блока и применяем к каждому потомку (блоку или боксу) переданный callback.

    При этом сперва вызываем callback, а потом уже обрабатываем под-дерево.
    Если же callback возвращает false, то подблоки не обрабатываем.

    @param {function(no.View): (boolean|undefined)} callback
*/
no.View.prototype.walk = function(callback) {
    var r = callback(this);
    if (r === false) { return; }

    this.processChildren(function(view) {
        view.walk(callback);
    });
};

/**
    Применяем переданный callback ко всем "детям" блока.
    Т.е. к непосредственным потомкам этого блока.

    @param {function(no.View)} callback
*/
//  FIXME: Внест эту функцию в walk?
no.View.prototype._processChildren = function(callback) {
    var boxes = this.boxes;
    for (var id in boxes) {
        var box = boxes[id];
        if (box.active) {
           callback( box[box.active] );
        }
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

//  FIXME: Нужны три состояния:
//
//    * блок виден;
//    * блок не виден потому, что один из его родителей не виден;
//    * блок не виден потому, что он сам не виден.
//
no.View.prototype._hide = function() {
    var node = this.node;
    if (node) {
        node.style.display = 'none';
    }
};

no.View.prototype._show = function() {
    var node = this.node;
    if (node) {
        node.style.display = '';
    }
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.View.prototype.onhtmlinit = no.pe;

no.View.prototype.onhtmldestroy = no.pe;

no.View.prototype.onshow = no.pe;

no.View.prototype.onhide = no.pe;

no.View.prototype.onrepaint = no.pe;

//  ---------------------------------------------------------------------------------------------------------------  //

//  При описании view можно задать поле events в виде:
//
//  events: {
//      'click a.foo': 'doFoo',
//      'keyup': function(e) { ... }
//  }
//
no.View.prototype._bindEvents = function() {
    var $node = $(this.node);

    var attachedEvents = this._attachedEvents = [];

    var that = this;
    var events = this.info.events = {};

    for (var event in events) {
        (function(event) {
            // Метод -- это либо строка с именем нужного метода, либо же функция.
            var method = events[event];
            if (typeof method === 'string') {
                method = that[method];
            }

            // Делим строку с event на имя события и опциональный селектор.
            var parts = event.split(/\s/);
            var name = parts.shift();
            var selector = parts.join(' ');

            var handler = function() {
                //  FIXME: Откуда это взялось?!
                // Не теряем остальные аргументы.
                var args = Array.prototype.slice.call(arguments, 0);
                return method.apply(that, args);
            };

            // Вешаем событие.
            if (selector) {
                $node.on(name, selector, handler);
            } else {
                $node.on(name, handler);
            }

            // Запоминаем, что повесили, чтобы знать потом, что удалять в _unbindEvents.
            attachedEvents.push({
                name: name,
                selector: selector,
                handler: handler
            });
        }(event));
    }
};

no.View.prototype._unbindEvents = function() {
    var $node = $(this.node);

    var attachedEvents = this._attachedEvents = [];

    for (var event in attachedEvents) {
        $node.off(event.name, event.selector, event.handler);
    }

    this._attachedEvents = null;
};

//  ---------------------------------------------------------------------------------------------------------------  //

no.View.prototype.update = function(layout_id, params) {
    var layout = no.layout.get(layout_id, this.id);
    var update = new no.Update(this, layout, params);

    return update.start();
};

})();


//  ---------------------------------------------------------------------------------------------------------------  //

/*
no.View.prototype._getStatus = function(params) {
    var models = this.info.models;
    for (var i = 0; i < models.length; i++) {
        if (!no.Model.get(models[i], params)) {
            return no.viewStatus.loading;
        }
    }
    return no.viewStatus.ok;
};

no.View.prototype.invalidate = function() {
    this.status = no.viewStatus.unknown;
};
*/

