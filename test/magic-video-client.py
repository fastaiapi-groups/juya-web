import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

source = Path(__file__).resolve().parents[1] / 'plugins/zzdh/video_plugin_fastai_magic/main.py'
spec = importlib.util.spec_from_file_location('magic_video_client', source)
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)
KEY = 'sk-client-fixture-only'


def response(data=None, headers=None, payload=b'mp4-fixture', status=200):
    result = Mock(status_code=status, headers=headers or {'Content-Type':'video/mp4'})
    result.json.return_value = data
    result.iter_content.return_value = [payload]
    result.raise_for_status.return_value = None
    return result


class ClientContract(unittest.TestCase):
    def settings(self, **values):
        return {**client.DEFAULTS, 'api_key':KEY, **values}

    def test_single_key_generates_canonical_payload_and_downloads_with_platform_auth(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(client, 'get_params', return_value=self.settings()), patch.object(client.requests, 'post', return_value=response({'id':'task_fixture'})) as post, patch.object(client.requests, 'get', side_effect=[response({'status':'completed'}), response()]) as get, contextlib.redirect_stdout(io.StringIO()) as output:
                result = client.generate({'prompt':'An unchanged prompt', 'output_dir':directory})
                payload = post.call_args.kwargs['json']
                self.assertEqual(payload, {'model':'sd-2-c1','input':{'prompt':'An unchanged prompt'},'parameters':{'duration':4,'resolution':'720p','ratio':'16:9'}})
                self.assertEqual(get.call_args.kwargs['headers'], {'Authorization':'Bearer '+KEY})
                self.assertEqual(Path(result[0]).read_bytes(), b'mp4-fixture')
                self.assertIn('https://tumeiapi.com/v1/videos/task_fixture/content', output.getvalue())
                self.assertNotIn(KEY, output.getvalue())

    def test_same_image_preserves_both_first_and_last_roles_but_uploads_only_once(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(client,'get_params',return_value=self.settings(generation_mode='首尾帧')), patch.object(client,'upload',return_value='https://cdn.example/reference.png') as upload, patch.object(client.requests,'post',return_value=response({'id':'task_frames'})) as post, patch.object(client.requests,'get',side_effect=[response({'status':'completed'}),response()]), contextlib.redirect_stdout(io.StringIO()):
                client.generate({'prompt':'An unchanged prompt','output_dir':directory,'first_frame_path':'same.png','end_frame_path':'same.png'})
                self.assertEqual(upload.call_count,1)
                self.assertEqual([m['type'] for m in post.call_args.kwargs['json']['input']['media']],['first_frame','last_frame'])

    def test_network_interruption_resumes_task_without_submitting_a_second_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(client,'get_params',return_value=self.settings()), patch.object(client.requests,'post',return_value=response({'id':'task_resume'})) as post, patch.object(client.requests,'get',side_effect=[client.requests.ConnectionError(),response({'status':'completed'}),response()]), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError,'网络或接口请求失败'):
                    client.generate({'prompt':'Sunset','output_dir':directory})
                saved = next(Path(directory).glob('*.task.json'))
                self.assertEqual(json.loads(saved.read_text()), {'id':'task_resume'})
                client.generate({'prompt':'Sunset','output_dir':directory})
                self.assertEqual(post.call_count,1)
                self.assertFalse(saved.exists())

    def test_uncertain_creation_does_not_automatically_repeat_the_paid_request(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(client,'get_params',return_value=self.settings()), patch.object(client.requests,'post',side_effect=client.requests.Timeout()) as post:
                with self.assertRaises(RuntimeError):client.generate({'prompt':'Sunset','output_dir':directory})
                with self.assertRaisesRegex(RuntimeError,'上次创建响应不确定'):client.generate({'prompt':'Sunset','output_dir':directory})
                self.assertEqual(post.call_count,1)

    def test_cross_host_redirect_does_not_receive_the_platform_key(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(client.requests,'get',side_effect=[response(headers={'Location':'https://cdn.example/video.mp4'},status=302),response()]) as get, contextlib.redirect_stdout(io.StringIO()):
            client.download('task_fixture',KEY,Path(directory)/'output.mp4')
            self.assertEqual(get.call_args_list[0].kwargs['headers'], {'Authorization':'Bearer '+KEY})
            self.assertEqual(get.call_args_list[1].kwargs['headers'], {})

    def test_local_upload_uses_only_the_first_party_upload_api(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(client.requests,'post',return_value=response({'url':'https://cdn.example/upload.png'},status=201)) as post:
            path=Path(directory)/'file.png';path.write_bytes(b'png-fixture')
            self.assertEqual(client.upload(str(path),KEY),'https://cdn.example/upload.png')
            self.assertEqual(post.call_args.args[0],'https://fastaiapi.cloud/help/magic-video/assets')
            self.assertEqual(post.call_args.kwargs['headers']['Authorization'],'Bearer '+KEY)

    def test_numbered_reference_slots_preserve_numeric_order(self):
        plan=client.media_plan({'reference_images':{'参考图片MAP':{'2':'second.png','1':'first.png'}}},self.settings(generation_mode='参考生视频'),client.MODELS['sd-2-c4'])
        self.assertEqual(plan,[('reference_image','first.png'),('reference_image','second.png')])

    def test_invalid_duration_never_reaches_generation_api(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(client,'get_params',return_value=self.settings(duration=11)), patch.object(client.requests,'post') as post:
            with self.assertRaisesRegex(RuntimeError,'时长超出'):client.generate({'prompt':'Sunset','output_dir':directory})
            post.assert_not_called()


if __name__ == '__main__':unittest.main()
