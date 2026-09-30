import { Button, Form, Input, Space, Table, message } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateUserInfo, updateWebPassword, uploadAvatar } from '../api/auth'
import { getJson } from '../api/biz'
import { setCurrentOrganization } from '../api/home'
import { PageHead, tell, useShell } from './kit'
import { setCampusId, setOrgId } from '../session'

interface Affiliation {
  id: number
  name: string
  organizationRole?: string
  isCurrent?: number
  campuses?: Array<{ id: number; name: string }>
}

export function AccountPage() {
  const shell = useShell()
  const navigate = useNavigate()
  const user = shell.user
  const [mine, setMine] = useState<Array<{ id: number; name: string }>>([])
  const [links, setLinks] = useState<Affiliation[]>([])

  useEffect(() => {
    getJson<Array<{ id: number; name: string }>>('/organizations/list').then(setMine).catch(() => setMine([]))
    getJson<Affiliation[]>('/organizations/affiliations').then(setLinks).catch(() => setLinks([]))
  }, [shell.currentOrgId])

  const name = user?.realName || user?.nickname || user?.nickName || '未命名'
  return (
    <section>
      <PageHead title="个人中心" extra="昵称、头像、当前职位，以及我的机构和关联机构。" />
      <section className="work-card">
        <div className="profile-hero">
          <ProfileAvatar url={user?.avatarUrl} name={name} />
          <div>
            <h2>{name}</h2>
            <p>手机号 {user?.phone || '未绑定'}</p>
            <p>{[user?.positionCampusName, user?.positionName].filter(Boolean).join(' · ') || '当前没有职位信息'}</p>
          </div>
        </div>
        <SpaceProfile user={user} onSaved={shell.reload} />
        <h3>网页登录密码</h3>
        <PasswordForm phone={user?.phone} alreadySet={!!user?.webPasswordSet} onSaved={shell.reload} />
        <Button onClick={() => navigate('/membership')}>会员续费与升级</Button>
      </section>
      <section className="work-card">
        <h2>我的机构</h2>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={mine}
          columns={[
            { title: '机构', dataIndex: 'name' },
            { title: '', render: (_: unknown, row: { id: number }) => <Button type="link" onClick={() => switchOrg(row.id, shell.reload, navigate)}>切换</Button> },
          ]}
        />
      </section>
      <section className="work-card">
        <h2>关联机构</h2>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={links}
          columns={[
            { title: '机构', dataIndex: 'name' },
            { title: '身份', dataIndex: 'organizationRole' },
            { title: '校区', render: (_: unknown, row: Affiliation) => (row.campuses || []).map((item) => item.name).join('、') },
            { title: '', render: (_: unknown, row: Affiliation) => row.isCurrent === 1 ? '当前' : <Button type="link" onClick={() => switchOrg(row.id, shell.reload, navigate)}>切换</Button> },
          ]}
        />
      </section>
    </section>
  )
}

function ProfileAvatar(props: { url?: string; name: string }) {
  const [broken, setBroken] = useState(false)
  if (!props.url || broken) return <span className="avatar-fallback">{props.name.slice(0, 1) || '我'}</span>
  return <img className="avatar-photo" src={props.url} alt="" onError={() => setBroken(true)} />
}

function SpaceProfile(props: { user: ReturnType<typeof useShell>['user']; onSaved: () => void }) {
  return (
    <>
      <Form
        layout="inline"
        initialValues={{ nickname: props.user?.nickname || props.user?.nickName || props.user?.realName }}
        onFinish={async (values: { nickname: string }) => {
          try {
            await updateUserInfo({ nickname: values.nickname, nickName: values.nickname })
            message.success('资料已保存')
            props.onSaved()
          } catch (error) {
            message.error(tell(error, '保存失败'))
          }
        }}
      >
        <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}><Input /></Form.Item>
        <Button htmlType="submit">保存</Button>
      </Form>
      <input
        className="file-picker"
        type="file"
        accept="image/*"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          try {
            await uploadAvatar(file)
            message.success('头像已更新')
            props.onSaved()
          } catch (error) {
            message.error(tell(error, '头像上传失败'))
          }
        }}
      />
    </>
  )
}

function PasswordForm(props: { phone?: string; alreadySet: boolean; onSaved: () => void }) {
  const [resetting, setResetting] = useState(false)
  if (!props.phone) return <p>请先绑定手机号后再设置网页登录密码。</p>
  return (
    <Form
      layout="vertical"
      style={{ maxWidth: 360 }}
      onFinish={async (values: { oldPassword?: string; newPassword?: string; confirm?: string }) => {
        const next = String(values.newPassword || '').trim()
        if (next.length < 8 || next.length > 32 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
          message.warning('密码需为8到32位，并包含字母和数字')
          return
        }
        if (next !== String(values.confirm || '').trim()) {
          message.warning('两次输入的密码不一致')
          return
        }
        if (next === props.phone?.trim()) {
          message.warning('密码不能与手机号相同')
          return
        }
        if (props.alreadySet && !resetting && !String(values.oldPassword || '').trim()) {
          message.warning('请输入原密码')
          return
        }
        try {
          await updateWebPassword({
            oldPassword: props.alreadySet && !resetting ? values.oldPassword : undefined,
            newPassword: next,
            reset: resetting || undefined,
          })
          message.success(resetting ? '网页登录密码已重置' : '网页登录密码已保存')
          setResetting(false)
          props.onSaved()
        } catch (error) {
          message.error(tell(error, '密码保存失败'))
        }
      }}
    >
      {props.alreadySet && !resetting ? <Form.Item name="oldPassword" label="原密码"><Input.Password /></Form.Item> : null}
      {resetting ? <p>你已登录，可以直接设置新密码。原密码会立即失效。</p> : null}
      <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }]}><Input.Password /></Form.Item>
      <Form.Item name="confirm" label="确认密码" rules={[{ required: true, message: '请再次输入新密码' }]}><Input.Password /></Form.Item>
      <Space>
        <Button type="primary" htmlType="submit">{props.alreadySet ? '修改密码' : '设置密码'}</Button>
        {props.alreadySet && !resetting ? <Button onClick={() => setResetting(true)}>忘记原密码</Button> : null}
        {resetting ? <Button onClick={() => setResetting(false)}>取消重置</Button> : null}
      </Space>
    </Form>
  )
}

async function switchOrg(orgId: number, reload: () => void, navigate: (path: string) => void) {
  try {
    await setCurrentOrganization(orgId)
    setOrgId(orgId)
    setCampusId(null)
    message.success('已切换机构')
    reload()
    navigate('/home')
  } catch (error) {
    message.error(tell(error, '切换失败'))
  }
}
