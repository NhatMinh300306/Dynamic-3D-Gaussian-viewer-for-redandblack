import importlib.util
import tempfile
import unittest
import json
from pathlib import Path
SCRIPTS=Path(__file__).resolve().parents[1]/'scripts'
def load(name):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
imp=load('import_sequence');demo=load('make_demo')

class ImportTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'models';self.root.mkdir()
    def tearDown(self):self.tmp.cleanup()
    def frame(self,res,frame):
        p=self.root/('redandblack_'+res)/frame/'point_cloud/iteration_30000/point_cloud.ply';demo.write_ply(p,demo.figure(0,12));return p
    def test_lapis_layout_and_portable_export(self):
        for q in ('res8','res1'):
            for f in ('1450','dynamic_1451'):self.frame(q,f)
        out=self.root.parent/'web-data'
        imp.main(['--root',str(self.root),'--output',str(out),'--scene','redandblack','--fps','30'])
        m=json.loads((out/'manifest.json').read_text());self.assertEqual([f['id'] for f in m['frames']],[1450,1451]);self.assertEqual(m['defaultQuality'],'res8')
        for f in m['frames']:
            for a in f['assets'].values():self.assertTrue((out/a['url']).exists());self.assertEqual(imp.inspect_ply(out/a['url']),12)
    def test_misaligned_qualities_fail(self):
        self.frame('res8','1450');self.frame('res8','dynamic_1451');self.frame('res1','1450')
        groups,_=imp.discover(self.root)
        with self.assertRaisesRegex(ValueError,'cùng frame'):imp.validate_frames(groups)
        self.assertEqual(imp.validate_frames(groups,intersection=True),[1450])
    def test_duplicate_and_raw_pointcloud_rejected(self):
        self.frame('res8','1450');self.frame('res8','dynamic_1450')
        with self.assertRaisesRegex(ValueError,'Trùng'):imp.discover(self.root)
        p=self.root/'raw.ply';p.write_text('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n')
        with self.assertRaisesRegex(ValueError,'Thiếu thuộc tính'):imp.inspect_ply(p)
    def test_cags_initial_and_reconstructed_sequence_frame_names(self):
        a=self.root/'frame0/point_cloud/iteration_30000/point_cloud.ply';demo.write_ply(a,demo.figure(0,6))
        b=self.root/'sequence/frame1/point_cloud/iteration_30000/point_cloud.ply';demo.write_ply(b,demo.figure(1,6))
        groups,_=imp.discover(self.root);self.assertEqual(imp.validate_frames(groups),[0,1])
    def test_no_input_overwrite_and_quantized_skip(self):
        self.frame('res8','1450')
        with self.assertRaisesRegex(ValueError,'tách biệt'):imp.main(['--root',str(self.root),'--output',str(self.root/'web')])
        p=self.root/'frame1/point_cloud_quantized.ply';p.parent.mkdir();p.write_text('not decoded')
        _,skip=imp.discover(self.root);self.assertEqual(skip,1)
if __name__=='__main__':unittest.main()
