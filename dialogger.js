function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [, ""])[1].replace(/\+/g, '%20')) || null
}

var loadOnStart = getURLParameter('load');
var graph = new joint.dia.Graph();
var widgetWidth = 256;
var widgetHeight = 128;

var defaultLink = new joint.dia.Link({
	attrs: {
		'.marker-target': { d: 'M 10 0 L 0 5 L 10 10 z' },
		'.link-tools .tool-remove circle, .marker-vertex': { r: 8 }
	}
});

defaultLink.set('smooth', true);

var allowableConnections = [
	['dialogue.Text', 'dialogue.Text'],
	['dialogue.Text', 'dialogue.Node'],
	['dialogue.Text', 'dialogue.Choice'],
	['dialogue.Text', 'dialogue.Set'],
	['dialogue.Text', 'dialogue.Call'],
	['dialogue.Text', 'dialogue.Branch'],
	['dialogue.Node', 'dialogue.Text'],
	['dialogue.Node', 'dialogue.Node'],
	['dialogue.Node', 'dialogue.Choice'],
	['dialogue.Node', 'dialogue.Set'],
	['dialogue.Node', 'dialogue.Call'],
	['dialogue.Node', 'dialogue.Branch'],
	['dialogue.Choice', 'dialogue.Text'],
	['dialogue.Choice', 'dialogue.Node'],
	['dialogue.Choice', 'dialogue.Set'],
	['dialogue.Choice', 'dialogue.Call'],
	['dialogue.Choice', 'dialogue.Branch'],
	['dialogue.Set', 'dialogue.Text'],
	['dialogue.Set', 'dialogue.Node'],
	['dialogue.Set', 'dialogue.Set'],
	['dialogue.Set', 'dialogue.Call'],
	['dialogue.Set', 'dialogue.Branch'],
	['dialogue.Call', 'dialogue.Text'],
	['dialogue.Call', 'dialogue.Node'],
	['dialogue.Call', 'dialogue.Set'],
	['dialogue.Call', 'dialogue.Call'],
	['dialogue.Call', 'dialogue.Branch'],
	['dialogue.Branch', 'dialogue.Text'],
	['dialogue.Branch', 'dialogue.Node'],
	['dialogue.Branch', 'dialogue.Set'],
	['dialogue.Branch', 'dialogue.Call'],
	['dialogue.Branch', 'dialogue.Branch']
];

function validateConnection(cellViewS, magnetS, cellViewT, magnetT) {
	// Prevent loop linking
	if (magnetS == magnetT) {
        return false;
    }

	if (cellViewS == cellViewT) {
        return false;
    }

	if (magnetT.attributes.magnet.nodeValue !== 'passive') { // Can't connect to an output port
        return false;
    }

	var sourceType = cellViewS.model.attributes.type;
	var targetType = cellViewT.model.attributes.type;
	var valid = false;
	for (var i = 0; i < allowableConnections.length; i++) {
		var rule = allowableConnections[i];
		if (sourceType == rule[0] && targetType == rule[1]) {
			valid = true;
			break;
		}
	}

	return valid;
}

function validateMagnet(cellView, magnet) {
	if (magnet.getAttribute('magnet') === 'passive') {
        return false;
    }

	// If unlimited connections attribute is null, we can only ever connect to one object
	// If it is not null, it is an array of type strings which are allowed to have unlimited connections
	var unlimitedConnections = magnet.getAttribute('unlimitedConnections');
	var links = graph.getConnectedLinks(cellView.model);
	for (var i = 0; i < links.length; i++) {
		var link = links[i];
		if (link.attributes.source.id === cellView.model.id && link.attributes.source.port === magnet.attributes.port.nodeValue) {
			// This port already has a connection
			if (unlimitedConnections && link.attributes.target.id) {
				var targetCell = graph.getCell(link.attributes.target.id);
				if (unlimitedConnections.indexOf(targetCell.attributes.type) !== -1) {
                    return true; // It's okay because this target type has unlimited connections
                }
			}
			return false;
		}
	}

	return true;
}

joint.shapes.dialogue = {};

joint.shapes.dialogue.Base = joint.shapes.devs.Model.extend({
	defaults: joint.util.deepSupplement(
	    {
            type: 'dialogue.Base',
            size: { width: widgetWidth, height: widgetHeight },
            name: '',
            attrs: {
                rect: { stroke: 'none', 'fill-opacity': 0 },
                text: { display: 'none' },
                '.inPorts circle': { magnet: 'passive' },
                '.outPorts circle': { magnet: true }
            }
        },
        joint.shapes.devs.Model.prototype.defaults
	)
});

joint.shapes.dialogue.Node = joint.shapes.devs.Model.extend({
    defaults: joint.util.deepSupplement(
        {
            type: 'dialogue.Node',
            inPorts: ['input'],
            outPorts: ['output'],
            attrs: {
                '.outPorts circle': { unlimitedConnections: ['dialogue.Choice'] }
            }
        },
        joint.shapes.dialogue.Base.prototype.defaults
    )
});

joint.shapes.dialogue.Text = joint.shapes.devs.Model.extend({
    defaults: joint.util.deepSupplement(
        {
            type: 'dialogue.Text',
            inPorts: ['input'],
            outPorts: ['output'],
            actor: '',
            attrs: {
                '.outPorts circle': { unlimitedConnections: ['dialogue.Choice'] }
            }
        },
        joint.shapes.dialogue.Base.prototype.defaults
    )
});

joint.shapes.dialogue.Choice = joint.shapes.devs.Model.extend({
    defaults: joint.util.deepSupplement(
        {
            type: 'dialogue.Choice',
            inPorts: ['input'],
            outPorts: ['output'],
            title: '',
            name: ''
        },
        joint.shapes.dialogue.Base.prototype.defaults
    )
});

joint.shapes.dialogue.Branch = joint.shapes.devs.Model.extend({
    defaults: joint.util.deepSupplement(
        {
            type: 'dialogue.Branch',
            inPorts: ['input'],
            outPorts: ['output0'],
            values: []
        },
        joint.shapes.dialogue.Base.prototype.defaults
    )
});

joint.shapes.dialogue.Set = joint.shapes.devs.Model.extend({
    defaults: joint.util.deepSupplement(
        {
            type: 'dialogue.Set',
            inPorts: ['input'],
            outPorts: ['output'],
            value: ''
        },
        joint.shapes.dialogue.Base.prototype.defaults
    )
});

joint.shapes.dialogue.Call = joint.shapes.devs.Model.extend({
    defaults: joint.util.deepSupplement(
        {
            type: 'dialogue.Call',
            inPorts: ['input'],
            outPorts: ['output'],
            parameters: []
        },
        joint.shapes.dialogue.Base.prototype.defaults
    )
});

joint.shapes.dialogue.BaseView = joint.shapes.devs.ModelView.extend({
	template: [
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
        '<input type="actor" class="actor" placeholder="Actor" />',
        '<p> <textarea class="name" rows="4" cols="27" placeholder="Speech"></textarea></p>',
        '</div>'
	].join(''),

	initialize: function() {
		_.bindAll(this, 'updateBox');
		joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

		this.$box = $(_.template(this.template, null, {})());
		// Prevent paper from handling pointerdown.
		this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });

	    // Prevent paper from handling pointerdown.
		this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.name').on('change', _.bind(function(evt) {
			this.model.set('name', $(evt.target).val());
		}, this));

	    // This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.actor').on('change', _.bind(function (evt) {
		    this.model.set('actor', $(evt.target).val());
		}, this));

	    // This is an example of reacting on the input change and storing the input data in the cell model. TEXTAREA
		this.$box.find('textarea.name').on('change', _.bind(function (evt) {
		    this.model.set('name', $(evt.target).val());
		}, this));

		this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
		// Update the box position whenever the underlying model changes.
		this.model.on('change', this.updateBox, this);
		// Remove the box when the model gets removed from the graph.
		this.model.on('remove', this.removeBox, this);

		this.updateBox();
	},

	render: function() {
		joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
		this.paper.$el.prepend(this.$box);
		this.updateBox();
		return this;
	},

	updateBox: function() {
		// Set the position and dimension of the box so that it covers the JointJS element.
	    var bbox = this.model.getBBox();
       
		// Example of updating the HTML with a data stored in the cell model.
		var nameField = this.$box.find('input.name');
		if (!nameField.is(':focus')) {
            nameField.val(this.model.get('name'));
        }

	    // Example of updating the HTML with a data stored in the cell model.
		var actorField = this.$box.find('input.actor');
		if (!actorField.is(':focus')) {
            actorField.val(this.model.get('actor'));
        }

	    // Example of updating the HTML with a data stored in the cell model.
		var textAreaField = this.$box.find('textarea.name');
		if (!textAreaField.is(':focus')) {
            textAreaField.val(this.model.get('name'));
        }

		var label = this.$box.find('.label');
		var type = this.model.get('type').slice('dialogue.'.length);
		label.text(type);
		label.attr('class', 'label ' + type);
		this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
	},

	removeBox: function() {
		this.$box.remove();
	}
});

joint.shapes.dialogue.NodeView = joint.shapes.dialogue.BaseView;

joint.shapes.dialogue.TextView = joint.shapes.dialogue.BaseView;

joint.shapes.dialogue.ChoiceView = joint.shapes.devs.ModelView.extend({
    template: [
		'<div class="node">',
		'<span class="label"> </span>',
		'<button class="delete">x</button>',
        '<input type="choice" class="title" placeholder="Title" />',
        '<p> <textarea class="name" rows="4" cols="27" placeholder="Speech"></textarea></p>',
		'</div>'
        		
	].join(''),

    initialize: function () {

        _.bindAll(this, 'updateBox');
        joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

        this.$box = $(_.template(this.template, null, {})());
        // Prevent paper from handling pointerdown.
        this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });
        this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });
        this.$box.find('idd').on('mousedown click', function (evt) { evt.stopPropagation(); });

        // This is an example of reacting on the input change and storing the input data in the cell model.
        this.$box.find('textarea.name').on('change', _.bind(function (evt) {
            this.model.set('name', $(evt.target).val());
        }, this));

        // This is an example of reacting on the input change and storing the input data in the cell model.
        this.$box.find('input.title').on('change', _.bind(function (evt) {
            this.model.set('title', $(evt.target).val());
        }, this));

        this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
        // Update the box position whenever the underlying model changes.
        this.model.on('change', this.updateBox, this);
        // Remove the box when the model gets removed from the graph.
        this.model.on('remove', this.removeBox, this);

        this.updateBox();
    },

    render: function () {
        joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
        this.paper.$el.prepend(this.$box);
        this.updateBox();
        return this;
    },

    updateBox: function () {
        // Set the position and dimension of the box so that it covers the JointJS element.
        var bbox = this.model.getBBox();
        // Example of updating the HTML with a data stored in the cell model.
        var nameField1 = this.$box.find('textarea.name');
        if (!nameField1.is(':focus')) {
            nameField1.val(this.model.get('name'));
        }

        // Example of updating the HTML with a data stored in the cell model.
        var nameField2 = this.$box.find('input.title');
        if (!nameField2.is(':focus')) {
            nameField2.val(this.model.get('title'));
        }

        var label = this.$box.find('.label');
        var type = this.model.get('type').slice('dialogue.'.length);
        label.text(type);
        label.attr('class', 'label ' + type);

        this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
    },

    removeBox: function () {
        this.$box.remove();
    }
});

joint.shapes.dialogue.BranchView = joint.shapes.dialogue.BaseView.extend({
	template: [
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<button class="add">+</button>',
		'<button class="remove">-</button>',
		'<input type="text" class="name" placeholder="Variable" />',
		'<input type="text" value="Default" readonly/>',
		'</div>'
	].join(''),

	initialize: function()
	{
		joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);
		this.$box.find('.add').on('click', _.bind(this.addPort, this));
		this.$box.find('.remove').on('click', _.bind(this.removePort, this));
	},

	removePort: function()
	{
		if (this.model.get('outPorts').length > 1)
		{
			var outPorts = this.model.get('outPorts').slice(0);
			outPorts.pop();
			this.model.set('outPorts', outPorts);
			var values = this.model.get('values').slice(0);
			values.pop();
			this.model.set('values', values);
			this.updateSize();
		}
	},

	addPort: function() {
		var outPorts = this.model.get('outPorts').slice(0);
		outPorts.push('output' + outPorts.length.toString());
		this.model.set('outPorts', outPorts);
		var values = this.model.get('values').slice(0);
		values.push(null);
		this.model.set('values', values);
		this.updateSize();
	},

	updateBox: function() {
		joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
		var values = this.model.get('values');
		var valueFields = this.$box.find('input.value');

		// Add value fields if necessary
		for (var i = valueFields.length; i < values.length; i++) {
			// Prevent paper from handling pointerdown.
			var field1 = $('<input type="text" class="value" />');
			field1.attr('placeholder', 'Value ' + (i + 1).toString());
			field1.attr('index', i);
			this.$box.append(field1);
			field1.on('mousedown click', function(evt) { evt.stopPropagation(); });

			// This is an example of reacting on the input change and storing the input data in the cell model.
			field1.on('change', _.bind(function(evt) {
				var values = this.model.get('values').slice(0);
				values[$(evt.target).attr('index')] = $(evt.target).val();
				this.model.set('values', values);
			}, this));
		}

		// Remove value fields if necessary
		for (var j = values.length; j < valueFields.length; j++) {
            $(valueFields[j]).remove();
        }

		// Update value fields
		valueFields = this.$box.find('input.value');
		for (var k = 0; k < valueFields.length; k++) {
			var field2 = $(valueFields[k]);
			if (!field2.is(':focus')) {
                field2.val(values[k]);
            }
		}
	},

	updateSize: function() {
		this.model.set('size', { width: widgetWidth, height: 100 + Math.max(0, (this.model.get('outPorts').length - 1) * 32) });
	}
});

joint.shapes.dialogue.SetView = joint.shapes.dialogue.BaseView.extend({
	template: [
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<input type="text" class="name" placeholder="Variable" />',
		'<input type="text" class="value" placeholder="Value" />',
		'</div>'
	].join(''),

	initialize: function() {
		joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);
		this.$box.find('input.value').on('change', _.bind(function(evt) {
			this.model.set('value', $(evt.target).val());
		}, this));
	},

	updateBox: function() {
		joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
		var field = this.$box.find('input.value');
		if (!field.is(':focus')) {
            field.val(this.model.get('value'));
        }
	}
});

joint.shapes.dialogue.CallView = joint.shapes.dialogue.BaseView.extend({
	template: [
		'<div class="node">',
		'    <span class="label"></span>',
		'    <button class="delete">x</button>',
        '    <button class="add">+</button>',
        '    <button class="remove">-</button>',
		'    <input type="text" class="context" placeholder="context" />',
		'    <input type="text" class="method" placeholder="method" />',
		'    <input type="text" class="parameter" placeholder="parameter" />',
		'</div>'
	].join(''),

	initialize: function() {
		joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);
        this.$box.find('.add').on('click', _.bind(this.addParameter, this));
        this.$box.find('.remove').on('click', _.bind(this.removeParameter, this));
		this.$box.find('input.context').on('change', _.bind(function(e) {
			this.model.set('context', $(e.target).val());
		}, this));
		this.$box.find('input.method').on('change', _.bind(function(e) {
			this.model.set('method', $(e.target).val());
		}, this));
	},

    removeParameter: function() {
        if (this.model.get('parameters').length > 0) {
            var parameters = this.model.get('parameters').slice(0);
            parameters.pop();
            this.model.set('parameters', parameters);
            this.updateSize();
        }
    },

    addParameter: function() {
        var parameters = this.model.get('parameters').slice(0);
        parameters.push(null);
        this.model.set('parameters', parameters);
        this.updateSize();
    },

	updateBox: function() {
		joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
		var context = this.$box.find('input.context');
		if (!context.is(':focus')) {
            context.val(this.model.get('context'));
        }
		var method = this.$box.find('input.method');
		if (!method.is(':focus')) {
            method.val(this.model.get('method'));
        }
        var parameters = this.model.get('parameters');
        var parameterFields = this.$box.find('input.parameter');

        // Add parameter fields if necessary
        for (var i = parameterFields.length; i < parameters.length; i++) {
            // Prevent paper from handling pointerdown.
            var field1 = $('<input type="text" class="parameter" />');
            field1.attr('placeholder', 'Parameter ' + (i + 1).toString());
            field1.attr('index', i);
            this.$box.append(field1);
            field1.on('mousedown click', function(evt) { evt.stopPropagation(); });

            // This is an example of reacting on the input change and storing the input data in the cell model.
            field1.on('change', _.bind(function(evt) {
                var parameters = this.model.get('parameters').slice(0);
                parameters[$(evt.target).attr('index')] = $(evt.target).val();
                this.model.set('parameters', parameters);
            }, this));
        }

        // Remove value fields if necessary
        for (var j = parameters.length; j < parameterFields.length; j++) {
            $(parameterFields[j]).remove();
        }

        // Update value fields
        parameterFields = this.$box.find('input.parameter');
        for (var k = 0; k < parameterFields.length; k++) {
            var field2 = $(parameterFields[k]);
            if (!field2.is(':focus')) {
                field2.val(parameters[k]);
            }
        }
	},

    updateSize: function() {
        this.model.set('size', { width: widgetWidth, height: 128 + Math.max(0, (this.model.get('parameters').length - 1) * 32) });
    }
});

function gameData() {
	var cells = graph.toJSON().cells;
	var nodesByID = {};
	var cellsByID = {};
	var nodes = [];
	for (var i = 0; i < cells.length; i++) {
		var cell1 = cells[i];
		if (cell1.type != 'link') {
			var node = {
				type: cell1.type.slice('dialogue.'.length),
				id: cell1.id,
				actor: cell1.actor,
                title: cell1.title
			};
			if (node.type == 'Branch') {
				node.variable = cell1.name;
				node.branches = {};
				for (var j = 0; j < cell1.values.length; j++) {
					var branch = cell1.values[j];
					node.branches[branch] = null;
				}
			} else if (node.type == 'Set') {
				node.variable = cell1.name;
				node.value = cell1.value;
				node.next = null;
			} else if (node.type == 'Call') {
				node.context = cell1.context;
                node.method = cell1.method;
                node.parameters = cell1.parameters;
				node.next = null;
			} else if (node.type == 'Choice') {
			    node.name = cell1.name;
			    node.title = cell1.title;
			    node.next = null;
			} else {
			    node.actor = cell1.actor;
				node.name = cell1.name;
				node.next = null;
			}
			nodes.push(node);
			nodesByID[cell1.id] = node;
			cellsByID[cell1.id] = cell1;
		}
	}
	for (var k = 0; k < cells.length; k++) {
		var cell2 = cells[k];
		if (cell2.type == 'link') {
			var source = nodesByID[cell2.source.id];
			var target = cell2.target ? nodesByID[cell2.target.id] : null;
			if (source) {
				if (source.type == 'Branch') {
					var portNumber = parseInt(cell2.source.port.slice('output'.length));
					var value;
					if (portNumber == 0) {
                        value = '_default';
                    } else {
						var sourceCell = cellsByID[source.id];
						value = sourceCell.values[portNumber - 1];
					}
					source.branches[value] = target ? target.id : null;
				} else if ((source.type == 'Text' || source.type == 'Node') && target && target.type == 'Choice') {
					if (!source.choices) {
						source.choices = [];
						delete source.next;
					}
					source.choices.push(target.id);
				} else {
                    source.next = target ? target.id : null;
                }
			}
		}
	}

	return nodes;
}


// Menu actions

var filename = null;
var defaultFilename = 'dialogue.json';
var bodyTag = $('body');
var containerElement = $('#container');
var paperElement = $('#paper');

function flash(text) {
	var $flash = $('#flash');
	$flash.text(text);
	$flash.stop(true, true);
	$flash.show();
	$flash.css('opacity', 1.0);
	$flash.fadeOut({ duration: 1500 });
}

function offerDownload(name, data) {
	var a = $('<a>');
	a.attr('download', name);
	a.attr('href', 'data:application/json,' + encodeURIComponent(JSON.stringify(data)));
	a.attr('target', '_blank');
	a.hide();
	bodyTag.append(a);
	a[0].click();
	a.remove();
}

function promptFilename(callback) {
    filename = prompt('Filename', defaultFilename);
    callback(filename);
}

function applyTextFields() {
	$('input[type=text]').blur();
}

function save() {
	applyTextFields();
	if (!filename) {
        promptFilename(doSave);
    } else {
        doSave();
    }
}

function doSave() {
	if (!filename) {
        return;
    }

    if (!localStorage[filename]) {
        addFileEntry(filename);
    }
    localStorage[filename] = JSON.stringify(graph);
    flash('Saved ' + filename);
}

function load() {
    $('#menu').show();
}

function exportFile() {
    applyTextFields();
    offerDownload(filename ? filename : defaultFilename, graph);
}

function gameFilenameFromNormalFilename(f) {
    return f.substring(0, f.length - 2) + 'on';
}

function exportGameFile() {
    applyTextFields();
    offerDownload(gameFilenameFromNormalFilename(filename ? filename : defaultFilename), gameData());
}

function importFile() {
    $('#file').click();
}

function add(constructor) {
	return function() {
		var position = $('#cmroot').position();
		var container = containerElement[0];
		var element = new constructor({
			position: { x: position.left + container.scrollLeft, y: position.top + container.scrollTop }
		});
		graph.addCells([element]);
	};
}

function clear() {
	graph.clear();
	filename = null;
}

// Browser stuff

var paper = new joint.dia.Paper({
	el: paperElement,
	width: 16000,
	height: 8000,
	model: graph,
	gridSize: 16,
	defaultLink: defaultLink,
	validateConnection: validateConnection,
	validateMagnet: validateMagnet,
	// Enable link snapping within 75px lookup radius
	snapLinks: { radius: 75 }

});

var panning = false;
var mousePosition = { x: 0, y: 0 };
paper.on('blank:pointerdown', function(e) {
	panning = true;
	mousePosition.x = e.pageX;
	mousePosition.y = e.pageY;
	bodyTag.css('cursor', 'move');
	applyTextFields();
});
paper.on('cell:pointerdown', function() {
	applyTextFields();
});

containerElement.mousemove(function(e) {
	if (panning) {
		var $this = $(this);
		$this.scrollLeft($this.scrollLeft() + mousePosition.x - e.pageX);
		$this.scrollTop($this.scrollTop() + mousePosition.y - e.pageY);
		mousePosition.x = e.pageX;
		mousePosition.y = e.pageY;
	}
});

containerElement.mouseup(function () {
	panning = false;
	bodyTag.css('cursor', 'default');
});

function handleFiles(files) {
	filename = files[0].name;
	var fileReader = new FileReader();
	fileReader.onload = function(e) {
		graph.clear();
		graph.fromJSON(JSON.parse(e.target.result));
	};
	fileReader.readAsText(files[0]);
}

$('#file').on('change', function() {
	handleFiles(this.files);
});

bodyTag.on('dragenter', function(e) {
	e.stopPropagation();
	e.preventDefault();
});

bodyTag.on('dragexit', function(e) {
	e.stopPropagation();
	e.preventDefault();
});

bodyTag.on('dragover', function(e) {
	e.stopPropagation();
	e.preventDefault();
});

/**
 * @param {jQuery.Event} e
 */
bodyTag.on('drop', function(e) {
	e.stopPropagation();
	e.preventDefault();
	handleFiles(e.originalEvent.dataTransfer.files);
});

$(window).on('keydown', function(event) {
	// Catch Ctrl-S or key code 19 on Mac (Cmd-S)
	if (((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() == 's') || event.which == 19) {
		event.stopPropagation();
		event.preventDefault();
		save();
		return false;
	} else if ((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() == 'o') {
		event.stopPropagation();
		event.preventDefault();
		load();
		return false;
	} else if ((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() == 'e') {
		event.stopPropagation();
		event.preventDefault();
		exportFile();
		return false;
	}

	return true;
});

$(window).resize(function() {
	applyTextFields();
	var $window = $(window);
	var $container = $('#container');
    $container.height($window.innerHeight());
    $container.width($window.innerWidth());
    var $menu = $('#menu');
    $menu.css('top', Math.max(0, (($window.height() - $menu.outerHeight()) / 2)) + 'px');
    $menu.css('left', Math.max(0, (($window.width() - $menu.outerWidth()) / 2)) + 'px');
    return this;
});

function addFileEntry(name) {
	var entry = $('<div>');
	entry.text(name);
	var deleteButton = $('<button class="delete">-</button>');
	entry.append(deleteButton);
	$('#menu').append(entry);

	deleteButton.on('click', function(event) {
		localStorage.removeItem(name);
		entry.remove();
		event.stopPropagation();
	});

	entry.on('click', function() {
		graph.clear();
		graph.fromJSON(JSON.parse(localStorage[name]));
		filename = name;
		$('#menu').hide();
	});
}

(function()
{
	for (var i = 0; i < localStorage.length; i++) {
        addFileEntry(localStorage.key(i));
    }
})();

$('#menu').find('button.close').click(function() {
	$('#menu').hide();
});

$(window).trigger('resize');

paperElement.contextmenu({
	width: 150,
	items: [
		{ text: 'Text', alias: '1-1', action: add(joint.shapes.dialogue.Text) },
		{ text: 'Choice', alias: '1-2', action: add(joint.shapes.dialogue.Choice) },
		{ text: 'Branch', alias: '1-3', action: add(joint.shapes.dialogue.Branch) },
		{ text: 'Set', alias: '1-4', action: add(joint.shapes.dialogue.Set) },
		{ text: 'Call', alias: '1-5', action: add(joint.shapes.dialogue.Call) },
		{ text: 'Node', alias: '1-6', action: add(joint.shapes.dialogue.Node) },
		{ type: 'splitLine' },
		{ text: 'Save', alias: '2-1', action: save },
		{ text: 'Load', alias: '2-2', action: load },
		{ text: 'Import', id: 'import', alias: '2-3', action: importFile },
		{ text: 'New', alias: '2-4', action: clear },
		{ text: 'Export', id: 'export', alias: '2-5', action: exportFile },
		{ text: 'Export game file', id: 'export-game', alias: '2-6', action: exportGameFile }
	]
});

///AUTOLOAD IF URL HAS ? WILDCARD
if (loadOnStart != null) {
    loadOnStart += '.json';
    console.log(loadOnStart);
    graph.clear();
    filename = loadOnStart;
    graph.fromJSON(JSON.parse(localStorage[loadOnStart]));
}
