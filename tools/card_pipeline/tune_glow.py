"""Boost line-art sweep glow and gold-foil text emission inside card.blend, then re-render the hero still."""
import bpy
import sys
from pathlib import Path

R = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.open_mainfile(filepath=str(R / 'card.blend'))

# The blend packs its textures, so disk updates never show up unless the packs are refreshed.
for im in bpy.data.images:
    if im.packed_file and im.filepath:
        fp = bpy.path.abspath(im.filepath)
        im.unpack(method='REMOVE')
        im.filepath = fp
        im.reload()
        im.pack()

front = bpy.data.materials['01 · 主体 + 背景 / 核心合成']
nodes = front.node_tree.nodes
limit = None
for n in nodes:
    if n.name.startswith('限制辉光覆盖'):
        n.inputs[1].default_value = 0.022
        limit = n
sub_tex = next(n for n in nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name == 'subject.png')
gate = next((n for n in nodes if n.name == '线辉光alpha门'), None)
if gate is None:
    gate = nodes.new('ShaderNodeMath')
    gate.name = '线辉光alpha门'
    gate.operation = 'MULTIPLY'
    gate.location = (limit.location.x + 180, limit.location.y - 160)
    front.node_tree.links.new(sub_tex.outputs['Alpha'], gate.inputs[1])
front.node_tree.links.new(limit.outputs[0], gate.inputs[0])
mix_node = next(n for n in nodes if n.name.startswith('线描发光与镭射结果混合'))
for l in list(front.node_tree.links):
    if l.to_node == mix_node and l.to_socket.name == 'Fac':
        front.node_tree.links.remove(l)
front.node_tree.links.new(gate.outputs[0], mix_node.inputs['Fac'])
text = bpy.data.materials['02 · 文字透明 / 深度0']
for n in text.node_tree.nodes:
    if n.name == '文字原理化':
        n.inputs['Emission Strength'].default_value = 0.5

bpy.ops.wm.save_mainfile()
bpy.context.scene.frame_set(25)
bpy.ops.render.render(write_still=True)
print('TUNE_AND_RENDER_COMPLETE')
